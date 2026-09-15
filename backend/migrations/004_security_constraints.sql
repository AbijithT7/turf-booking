-- 004_security_constraints.sql
-- Add user_id to team openings, team requests, community posts, and community requests

ALTER TABLE TeamOpenings ADD COLUMN user_id INTEGER REFERENCES Users(id);
ALTER TABLE TeamRequests ADD COLUMN user_id INTEGER REFERENCES Users(id);
ALTER TABLE CommunityPosts ADD COLUMN user_id INTEGER REFERENCES Users(id);
ALTER TABLE CommunityRequests ADD COLUMN user_id INTEGER REFERENCES Users(id);

-- Update existing community posts and openings to map to users based on phone/email
UPDATE TeamOpenings SET user_id = (SELECT id FROM Users WHERE Users.phone = TeamOpenings.creator_phone LIMIT 1) WHERE user_id IS NULL;
UPDATE CommunityPosts SET user_id = (SELECT id FROM Users WHERE Users.phone = CommunityPosts.created_by_phone OR Users.email = CommunityPosts.created_by_email LIMIT 1) WHERE user_id IS NULL;
UPDATE CommunityRequests SET user_id = (SELECT id FROM Users WHERE Users.phone = CommunityRequests.applicant_phone OR Users.email = CommunityRequests.applicant_email LIMIT 1) WHERE user_id IS NULL;

-- Create indices for performance and integrity
CREATE INDEX IF NOT EXISTS idx_bookings_user ON Bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots ON BlockedSlots(turf_id, blocked_date, slot_hour);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON CommunityPosts(user_id);
CREATE INDEX IF NOT EXISTS idx_team_openings_user ON TeamOpenings(user_id);
