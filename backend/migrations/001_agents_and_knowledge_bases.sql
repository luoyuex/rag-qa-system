CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  avatar VARCHAR(255) NULL,
  system_prompt TEXT NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_agents_knowledge_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
);

-- 在执行下面两条 ALTER 前，先创建默认知识库和 Agent，并把 UUID 填入变量。
-- SET @knowledge_base_id = '...';
-- SET @agent_id = '...';
ALTER TABLE documents ADD COLUMN knowledge_base_id VARCHAR(36) NULL;
ALTER TABLE chat_sessions ADD COLUMN agent_id VARCHAR(36) NULL;
-- UPDATE documents SET knowledge_base_id = @knowledge_base_id WHERE knowledge_base_id IS NULL;
-- UPDATE chat_sessions SET agent_id = @agent_id WHERE agent_id IS NULL;
-- ALTER TABLE documents MODIFY knowledge_base_id VARCHAR(36) NOT NULL;
-- ALTER TABLE chat_sessions MODIFY agent_id VARCHAR(36) NOT NULL;
-- ALTER TABLE documents ADD CONSTRAINT fk_documents_knowledge_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id);
-- ALTER TABLE chat_sessions ADD CONSTRAINT fk_sessions_agent FOREIGN KEY (agent_id) REFERENCES agents(id);
