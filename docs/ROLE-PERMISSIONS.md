# Role & Permissions Matrix — YSA AMS

## 1. Supported Roles

1. **`system_admin`**
   - Stake Application Systems Administrator.
   - Authorized to manage user accounts, assign/revoke roles, manage unit assignments, register stake units, and review security audit trails.
2. **`stake_presidency`**
   - Executive leadership oversight across all wards and branches in Abeokuta Nigeria Obantoko Stake.
   - Authorized to view stake-wide statistics and audit trails.
   - Cannot modify system administration or reassign roles.
3. **`bishop`**
   - Presiding authority over an assigned **Ward** (e.g. Obantoko 1st Ward, Asero Ward).
   - Scoped strictly to their assigned ward's members and attendance.
   - Cannot be assigned to a branch (enforced by trigger `trg_validate_unit_assignment`).
4. **`branch_president`**
   - Presiding authority over an assigned **Branch** (e.g. Alabata Branch, Odeda Branch).
   - Scoped strictly to their assigned branch's members and attendance.
   - Cannot be assigned to a ward (enforced by trigger `trg_validate_unit_assignment`).
5. **`ysa_leader`**
   - YSA representative/leader assigned to a ward, branch, or stake committee.
   - Multiple YSA leaders can be assigned to a single unit.
   - Zero administrative or role assignment permissions.

---

## 2. Permissions Matrix

| Capability / Action | system_admin | stake_presidency | bishop | branch_president | ysa_leader |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Access Admin Dashboard | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign or Revoke User Roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Activate / Deactivate Accounts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / Edit Stake Units | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Users to Wards/Branches | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Security Audit Logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| View Own Profile & Roles | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update Own Full Name | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Stake-Wide Units (Wards/Branches) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Assigned Ward Attendance (Future) | ✅ | ✅ | ✅ (Own Ward) | ❌ | ✅ (If Assigned) |
| View Assigned Branch Attendance (Future)| ✅ | ✅ | ❌ | ✅ (Own Branch)| ✅ (If Assigned) |

---

## 3. Disallowed Role Combinations
- A user **cannot** simultaneously hold `bishop` and `branch_president` roles.
- `trg_validate_unit_assignment` validates that the user possesses the matching role before assigning them to a ward or branch.
