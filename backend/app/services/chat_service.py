import re
from typing import Generator, List

import ollama
from openai import OpenAI
from sqlalchemy.orm import Session

from app import config
from app.models import Agent, ChatMessage, ChatSession, Setting
from app.services.embedding import get_embedding
from app.services.milvus_client import client, COLLECTION_NAME


# ============================================================
# 读取管理后台配置的上下文轮数
# ============================================================

def get_context_rounds(db: Session) -> int:

    setting = db.query(Setting).filter(Setting.key == "context_rounds").first()

    if setting is None:
        return config.DEFAULT_CONTEXT_ROUNDS

    return int(setting.value)


# ============================================================
# 读取管理后台配置的对话模型（本地 Ollama / 线上 OpenAI 兼容接口）
# ============================================================

def get_model_settings(db: Session) -> dict:

    rows = db.query(Setting).filter(
        Setting.key.in_([
            "chat_provider",
            "chat_local_model",
            "chat_online_base_url",
            "chat_online_api_key",
            "chat_online_model",
        ])
    ).all()

    values = {row.key: row.value for row in rows}

    return {
        "provider": values.get("chat_provider", config.DEFAULT_CHAT_PROVIDER),
        "local_model": values.get("chat_local_model", config.CHAT_MODEL),
        "online_base_url": values.get("chat_online_base_url", config.DEFAULT_ONLINE_BASE_URL),
        "online_api_key": values.get("chat_online_api_key", config.DEFAULT_ONLINE_API_KEY),
        "online_model": values.get("chat_online_model", config.DEFAULT_ONLINE_MODEL),
    }


# ============================================================
# 检索 Milvus
# ============================================================

def search_milvus(question: str, knowledge_base_id: str, limit: int = 5):

    vector = get_embedding(question)

    return client.search(
        collection_name=COLLECTION_NAME,
        data=[vector],
        anns_field="vector",
        filter=f'knowledge_base_id == "{knowledge_base_id}"',
        limit=limit,
        output_fields=["text"],
        search_params={"metric_type": "COSINE"},
    )


# ============================================================
# 构造 Prompt
# ============================================================

def build_prompt(question: str, retrieved_context: str, history: List[ChatMessage], system_prompt: str) -> str:

    history_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}：{m.content}"
        for m in history
    )

    return f"""
        【Agent 角色】
        {system_prompt}

        你是一个智能助手。

        请根据知识库中的资料回答用户的问题，并结合历史对话保持上下文连贯。

        【历史对话】
        {history_text or "（无）"}

        【知识库资料】
        {retrieved_context or "（无相关资料）"}

        【用户问题】
        {question}

        【回答要求】
        1. 优先根据知识库资料回答
        2. 不要编造知识库中不存在的信息
        3. 如果知识库中没有相关信息，请明确说明
        4. 结合历史对话理解用户当前问题的上下文
        5. 回答简洁、准确
    """


# ============================================================
# 按 provider 生成回答（本地 Ollama / 线上 OpenAI 兼容接口）
# ============================================================

def _generate_local(prompt: str, model_settings: dict) -> Generator[str, None, None]:

    response = ollama.chat(
        model=model_settings["local_model"],
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )

    for chunk in response:

        content = chunk["message"]["content"]

        if content:
            yield content


def _generate_online(prompt: str, model_settings: dict) -> Generator[str, None, None]:

    if not model_settings["online_base_url"] or not model_settings["online_api_key"] or not model_settings["online_model"]:
        raise ValueError("线上模型未配置完整，请到后台「模型设置」填写 base_url / api_key / model")

    online_client = OpenAI(
        base_url=model_settings["online_base_url"],
        api_key=model_settings["online_api_key"],
    )

    stream = online_client.chat.completions.create(
        model=model_settings["online_model"],
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )

    for chunk in stream:

        delta = chunk.choices[0].delta.content

        if delta:
            yield delta


def generate_answer(prompt: str, model_settings: dict) -> Generator[str, None, None]:

    if model_settings["provider"] == "online":
        yield from _generate_online(prompt, model_settings)
    else:
        yield from _generate_local(prompt, model_settings)


# ============================================================
# 根据首轮问答生成会话标题（仿 ChatGPT：只在第一轮触发一次）
# ============================================================

TITLE_PROMPT_TEMPLATE = """根据下面这段问答内容，生成一个不超过 12 个字的对话标题，用于在会话列表中展示。
只输出标题本身，不要加标点、引号或任何解释。

问：{question}
答：{answer}
"""


def generate_title(question: str, answer: str, model_settings: dict) -> str:

    prompt = TITLE_PROMPT_TEMPLATE.format(question=question[:200], answer=answer[:200])

    # 部分模型（如 deepseek-r1、kimi-k2.5）是推理模型，
    # 会先输出一大段思考过程再给出正文，且不少接口不支持关闭思考，
    # 所以 token 预算必须留够思考 + 正文，否则思考没走完就被截断，正文会是空的
    if model_settings["provider"] == "online":
        online_client = OpenAI(
            base_url=model_settings["online_base_url"],
            api_key=model_settings["online_api_key"],
        )
        response = online_client.chat.completions.create(
            model=model_settings["online_model"],
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            max_tokens=1536,
        )
        title = response.choices[0].message.content or ""
    else:
        response = ollama.chat(
            model=model_settings["local_model"],
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            options={"num_predict": 1536},
        )
        title = response["message"]["content"] or ""

    # 去掉推理模型可能夹带的 <think>...</think> 思考块
    title = re.sub(r"<think>.*?</think>", "", title, flags=re.DOTALL)

    return title.strip().strip("\"'“”‘’").splitlines()[0][:64] if title.strip() else ""


def _generate_and_save_title(session_factory, session_id: str, question: str, answer: str, model_settings: dict):
    """在 BackgroundTasks 里跑，标题生成较慢（推理模型思考耗时），
    与流式回答的响应解耦，不阻塞前端拿到完整回答。"""

    db = session_factory()

    try:
        title = generate_title(question, answer, model_settings)

        if title:
            session = db.get(ChatSession, session_id)
            if session is not None:
                session.title = title
                db.commit()
    except Exception as e:
        # 标题生成失败不影响主流程，前端会 fallback 到时间展示
        print(f"[chat_service] 生成会话标题失败：{e}")
    finally:
        db.close()


# ============================================================
# 流式生成回答
#
# 使用独立的 db session（session_factory），因为 StreamingResponse
# 会在请求依赖的 session 关闭之后才真正消费这个生成器
# ============================================================

def stream_answer(session_factory, session_id: str, question: str) -> Generator[str, None, None]:

    db = session_factory()

    try:

        rounds = get_context_rounds(db)
        model_settings = get_model_settings(db)

        session = db.get(ChatSession, session_id)
        agent = db.get(Agent, session.agent_id) if session else None
        if agent is None:
            raise ValueError("会话未绑定有效 Agent")

        history = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(rounds * 2)
            .all()
        )
        history.reverse()

        results = search_milvus(question, agent.knowledge_base_id)

        context_list = []

        for result in results[0]:

            text = result["entity"]["text"]
            score = result["distance"]

            context_list.append(
                f"内容：{text}\n"
                f"相似度：{score:.4f}"
            )

        retrieved_context = "\n\n".join(context_list)

        prompt = build_prompt(question, retrieved_context, history, agent.system_prompt)

        is_first_round = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .count()
        ) == 0

        user_message = ChatMessage(session_id=session_id, role="user", content=question)
        db.add(user_message)
        db.commit()

        full_answer = ""

        try:
            for content in generate_answer(prompt, model_settings):
                full_answer += content
                yield content
        except Exception as e:
            error_text = f"\n\n[模型调用失败：{e}]"
            full_answer += error_text
            yield error_text

        assistant_message = ChatMessage(session_id=session_id, role="assistant", content=full_answer)
        db.add(assistant_message)
        db.commit()

        if is_first_round:
            try:
                title = generate_title(question, full_answer, model_settings)
                if title:
                    session = db.get(ChatSession, session_id)
                    session.title = title
                    db.commit()
            except Exception as e:
                # 标题生成失败不影响主流程，前端会 fallback 到时间展示
                print(f"[chat_service] 生成会话标题失败：{e}")

    finally:
        db.close()
