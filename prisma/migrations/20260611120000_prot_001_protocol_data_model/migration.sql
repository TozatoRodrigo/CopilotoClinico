-- PROT-001: Modelo de dados de protocolos versionados (árvore de decisão)
-- Adiciona protocols / protocol_nodes / protocol_edges, complementares ao RAG,
-- para fluxos institucionais determinísticos (pergunta -> condição -> próximo
-- passo/ação). Versões "published" são imutáveis na camada de serviço:
-- editar um protocolo publicado cria uma nova linha com version = version + 1,
-- e a versão anterior permanece consultável (sem retire automático).
--
-- Reversível via: DROP TABLE "protocol_edges"; DROP TABLE "protocol_nodes";
-- DROP TABLE "protocols"; DROP TYPE "ProtocolNodeType"; DROP TYPE "ProtocolStatus";

CREATE TYPE "ProtocolStatus" AS ENUM ('draft', 'published', 'retired');
CREATE TYPE "ProtocolNodeType" AS ENUM ('question', 'action', 'outcome');

CREATE TABLE "protocols" (
    "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
    "name"           TEXT            NOT NULL,
    "specialty"      TEXT            NOT NULL,
    "version"        INTEGER         NOT NULL DEFAULT 1,
    "status"         "ProtocolStatus" NOT NULL DEFAULT 'draft',
    "institution_id" UUID,
    "source_ref"     TEXT,
    "created_by"     UUID            NOT NULL,
    "published_at"   TIMESTAMP(3),
    "created_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "protocol_nodes" (
    "id"          UUID                NOT NULL DEFAULT gen_random_uuid(),
    "protocol_id" UUID                NOT NULL,
    "node_type"   "ProtocolNodeType"  NOT NULL,
    "content"     JSONB               NOT NULL,
    "order"       INTEGER             NOT NULL,
    "created_at"  TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_nodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "protocol_edges" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "from_node_id"  UUID         NOT NULL,
    "to_node_id"    UUID         NOT NULL,
    "condition"     JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_edges_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "protocol_nodes"
    ADD CONSTRAINT "protocol_nodes_protocol_id_fkey"
    FOREIGN KEY ("protocol_id") REFERENCES "protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "protocol_edges"
    ADD CONSTRAINT "protocol_edges_from_node_id_fkey"
    FOREIGN KEY ("from_node_id") REFERENCES "protocol_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "protocol_edges"
    ADD CONSTRAINT "protocol_edges_to_node_id_fkey"
    FOREIGN KEY ("to_node_id") REFERENCES "protocol_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "protocols_name_specialty_institution_id_idx" ON "protocols"("name", "specialty", "institution_id");
CREATE INDEX "protocols_status_idx" ON "protocols"("status");
CREATE INDEX "protocol_nodes_protocol_id_idx" ON "protocol_nodes"("protocol_id");
CREATE INDEX "protocol_edges_from_node_id_idx" ON "protocol_edges"("from_node_id");
CREATE INDEX "protocol_edges_to_node_id_idx" ON "protocol_edges"("to_node_id");
