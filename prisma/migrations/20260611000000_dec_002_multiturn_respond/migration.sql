-- DEC-002: Multi-turn copilot analysis (respond endpoint)
-- Adds turn tracking and a self-relation so a follow-up analysis can
-- reference the interaction that raised the clarifying questions.

ALTER TABLE "ai_interactions"
  ADD COLUMN "turn_index" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "parent_interaction_id" UUID,
  ADD COLUMN "answered_questions" JSONB;

ALTER TABLE "ai_interactions"
  ADD CONSTRAINT "ai_interactions_parent_interaction_id_fkey"
    FOREIGN KEY ("parent_interaction_id")
    REFERENCES "ai_interactions"("id")
    ON DELETE SET NULL;

CREATE INDEX "ai_interactions_parent_interaction_id_idx"
  ON "ai_interactions"("parent_interaction_id");
