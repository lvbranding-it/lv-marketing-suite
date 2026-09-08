# Ambassador role isolation correction

The named new ambassador account was correctly invited as an ambassador, but the legacy signup trigger also created a personal owner workspace at the same instant as signup. It had no internal membership in the inviting LV organization.

Migration 006 skips owner-workspace creation for pending invitation recipients. Representative-only accounts cannot use portal administration or access/create internal organizations and memberships. Existing legitimate administrators with internal owner/admin membership in their representative organization retain their internal access. Inactive representatives cannot fall back to personal owner access. Internal frontend routes check portal_account_restricted and send restricted accounts to /portal.

No bulk membership revocation is included. A separately scoped repair archives and removes only the confirmed account's exact personal owner membership, guarded by account/email and ambassador-role checks. Organizations, projects and all other accounts are preserved. Recovery records are in portal_access_corrections and cannot be read by browser roles.

The earlier proposed global membership-removal migration was rejected by automatic approval review and was not applied. This revision preserves legitimate dual-role administrators and limits membership removal to the account identified by the user.
