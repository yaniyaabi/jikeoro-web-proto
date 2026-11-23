Jikeoro local data import

Version 2: publishes verified files individually instead of renaming the NAS directory. It reuses checksum-matching files from a previous interrupted copy and retains the previous staging folder. Database rows remain unpublished until the transaction commits.

Before running:
- Stop the Node server window (start-server.cmd) using Ctrl+C. Keep Docker Desktop running.
- Keep the source CSV and migration-check-result.json in C:\Users\healt\jikeoro-migration.
- Keep NAS originals in 100. Data\supabase-originals\report-media.
- Extract this ZIP completely into a new folder on the lab/server computer.

Double-click import-migration.cmd.

The tool checks that the CSV and media match the successful preflight, makes a fresh local database backup on NAS, copies originals into the service media folder, builds small metadata-free image previews, and imports users/reports/media/history/audit in one PostgreSQL transaction. Account and report UUIDs and supported bcrypt password hashes are preserved. Existing local accounts are not overwritten. New registration still requires an 8-character password; imported accounts can use their existing shorter password.

It does not modify Supabase or the NAS source archive. It does not import cloud sessions or device subscriptions, and does not send notifications. It records completion transactionally; running the same import again verifies the completed import instead of adding duplicate records. If an insert fails, imported rows are rolled back and copied files are kept for a safe retry. An undecodable historical image retains its original, and a missing-preview warning is recorded.

After IMPORT COMPLETE:
1. Run C:\Users\healt\jikeoro-server\start-server.cmd.
2. Open http://127.0.0.1:3001/web/admin/ and verify existing reports and representative photos.
3. Test your original member account on the local website or /app/.

This imports the checked snapshot only. Before public cutover, check for newer Supabase records and perform any required final synchronization. HTTPS tunnel setup, public client deployment and old cloud reminder shutdown are still pending. Keep Supabase and the originals until those checks are completed.

Share only the final console summary (Imported users / Reports / Media / Verified files / Preview warnings / IMPORT result). Do not share the source CSV or passwords.
