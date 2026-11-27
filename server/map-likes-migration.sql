CREATE TABLE IF NOT EXISTS jikeoro.report_likes (
  report_id uuid NOT NULL REFERENCES jikeoro.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES jikeoro.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(report_id,user_id)
);
CREATE INDEX IF NOT EXISTS report_likes_user_idx ON jikeoro.report_likes(user_id);
GRANT SELECT,INSERT,DELETE ON jikeoro.report_likes TO jikeoro_api;
