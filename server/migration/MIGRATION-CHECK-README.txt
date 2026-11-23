Jikeoro migration preflight

1. Copy this ZIP to the lab/server computer and extract it completely into a new folder.
2. Keep exactly one Supabase export CSV in C:\Users\healt\jikeoro-migration.
3. Keep originals on NAS in 100. Data\supabase-originals\report-media, including all original subfolders.
4. Double-click check-migration.cmd. Keep Docker running. The web server can stay running.

The tool reads the CSV, original media files and local database. It does not import, update or delete database records. It does not contact Supabase or send notifications. It saves migration-check-result.json next to the CSV with file checksums, counts and review codes.

Share only the console summary (Users / Reports / Media / Checked files / Errors / Warnings / CHECK result). Keep the CSV private: it contains member emails and password hashes.

CHECK OK is a preflight result, not a completed migration or cutover. Keep the Supabase source and NAS originals intact until import verification and the final cutover are completed.
