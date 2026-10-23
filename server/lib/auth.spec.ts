import { describe, it, expect } from "vitest";
import { generateToken, generateUserToken, verifyToken } from "./auth";
import { 
  findUserByUsernameOrEmail, 
  validatePassword, 
  hashPassword, 
  getUserProfile, 
  usersDatabase,
  createUser,
  updateUser,
  deleteUser
} from "./users";

describe("Authentication & RBAC System", () => {
  describe("JWT Auth Utilities", () => {
    it("should generate valid signed token for Admin role", () => {
      const token = generateToken("Admin");
      expect(token).toBeDefined();
      expect(token.split(".")).toHaveLength(3);
    });

    it("should verify token and extract user role payload", () => {
      const token = generateToken("Supervisor");
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.role).toBe("Supervisor");
      expect(payload?.userId).toBe("user-supervisor");
    });

    it("should generate user-specific tokens with full profile metadata", () => {
      const adminUser = usersDatabase[0];
      const token = generateUserToken(adminUser);
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe("usr-admin-01");
      expect(payload?.role).toBe("Admin");
      expect(payload?.username).toBe("admin");
      expect(payload?.email).toBe("gauravraj77820@gmail.com");
    });

    it("should reject tampered or invalid tokens", () => {
      const token = generateToken("Operator");
      const tampered = token.slice(0, -5) + "abcde";
      expect(verifyToken(tampered)).toBeNull();
      expect(verifyToken("invalid.token.string")).toBeNull();
    });
  });

  describe("Admin & Dynamic User Provisioning", () => {
    it("should authenticate initial seeded Admin with default credentials", () => {
      const user = findUserByUsernameOrEmail("admin");
      expect(user).toBeDefined();
      expect(user?.role).toBe("Admin");
      expect(validatePassword(user!, "Admin@123")).toBe(true);
      expect(validatePassword(user!, "WrongPass@123")).toBe(false);
    });

    it("should allow Admin to create, authenticate, and update new role credentials dynamically", () => {
      // 1. Create new Supervisor
      const newSupervisor = createUser({
        username: "testsupervisor",
        email: "supervisor.test@sejalglass.com",
        name: "Test Supervisor",
        role: "Supervisor",
        password: "SuperSecret@2026",
      });

      expect(newSupervisor.id).toBeDefined();
      expect(newSupervisor.role).toBe("Supervisor");

      // 2. Verify authentication
      const user = findUserByUsernameOrEmail("testsupervisor");
      expect(user).toBeDefined();
      expect(validatePassword(user!, "SuperSecret@2026")).toBe(true);
      expect(validatePassword(user!, "WrongPassword")).toBe(false);

      // 3. Update password
      updateUser(newSupervisor.id, { password: "NewSupervisorPass@99" });
      const updatedUser = findUserByUsernameOrEmail("testsupervisor");
      expect(validatePassword(updatedUser!, "NewSupervisorPass@99")).toBe(true);

      // 4. Clean up
      deleteUser(newSupervisor.id);
      expect(findUserByUsernameOrEmail("testsupervisor")).toBeUndefined();
    });

    it("should return safe public user profile without sensitive salt or hash", () => {
      const user = findUserByUsernameOrEmail("admin")!;
      const profile = getUserProfile(user);

      expect(profile).toHaveProperty("id");
      expect(profile).toHaveProperty("username");
      expect(profile).toHaveProperty("name");
      expect(profile).toHaveProperty("email");
      expect(profile).toHaveProperty("role");
      expect(profile).not.toHaveProperty("passwordHash");
      expect(profile).not.toHaveProperty("salt");
    });

    it("should produce cryptographically distinct hashes for different salts", () => {
      const password = "SharedPassword@123";
      const salt1 = "salt_one_12345678";
      const salt2 = "salt_two_87654321";

      const res1 = hashPassword(password, salt1);
      const res2 = hashPassword(password, salt2);

      expect(res1.hash).not.toBe(res2.hash);
    });
  });

  describe("Real-Time Sessions & Heartbeat Tracking", () => {
    it("should register active sessions and update heartbeats", async () => {
      const { createSession, updateSessionHeartbeat, getActiveSessionsList, revokeSession } = await import("./users");
      const testUser = {
        id: "usr-test-01",
        username: "testuser",
        email: "test@sejalglass.com",
        name: "Test User",
        role: "Operator" as const,
      };

      const session = createSession(testUser, "192.168.1.100", "Mozilla Test Scanner");
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe("Active");

      const updated = updateSessionHeartbeat(session.sessionId);
      expect(updated).toBe(true);

      const sessions = getActiveSessionsList();
      expect(sessions.some((s) => s.sessionId === session.sessionId)).toBe(true);

      const revoked = revokeSession(session.sessionId);
      expect(revoked).toBe(true);
    });
  });

  describe("Password Reset & OTP Workflow", () => {
    it("should generate 6-digit OTP and reset password upon verification", async () => {
      const { createPasswordResetOtp, verifyAndResetPassword } = await import("./users");

      // 1. Generate OTP for admin
      const { otp, user } = createPasswordResetOtp("admin");
      expect(otp).toBeDefined();
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
      expect(user.username).toBe("admin");

      // 2. Reject incorrect OTP
      expect(() => {
        verifyAndResetPassword("admin", "000000", "NewAdminSecret@999");
      }).toThrow(/Invalid OTP code/);

      // 3. Accept correct OTP
      const result = verifyAndResetPassword("admin", otp, "NewAdminSecret@999");
      expect(result.success).toBe(true);

      // 4. Verify user can now authenticate with new password
      const updatedAdmin = findUserByUsernameOrEmail("admin")!;
      expect(validatePassword(updatedAdmin, "NewAdminSecret@999")).toBe(true);

      // 5. Restore default Admin password for standard test suite
      updateUser(updatedAdmin.id, { password: "Admin@123" });
    });
  });

  describe("Granular User Permission Customization (User A vs. User B)", () => {
    it("should allow giving custom permissions to User A while User B retains default role permissions", async () => {
      const { 
        getUserEffectivePermissions, 
        updateUserPermission, 
        resetUserPermissions 
      } = await import("./users");

      const userA = createUser({
        username: "operator_a",
        email: "operator_a@sejalglass.com",
        name: "Operator A",
        role: "Operator",
        password: "OperatorPass@1",
      });

      const userB = createUser({
        username: "operator_b",
        email: "operator_b@sejalglass.com",
        name: "Operator B",
        role: "Operator",
        password: "OperatorPass@2",
      });

      try {
        // 1. Both start with default operator permissions (canUploadPI: false)
        const userAObj = findUserByUsernameOrEmail("operator_a")!;
        const userBObj = findUserByUsernameOrEmail("operator_b")!;

        const initialA = getUserEffectivePermissions(userAObj);
        const initialB = getUserEffectivePermissions(userBObj);
        expect(initialA.canUploadPI).toBe(false);
        expect(initialB.canUploadPI).toBe(false);

        // 2. Grant canUploadPI and revoke module:cutting for User A only
        const updatedResA = updateUserPermission(userA.id, "canUploadPI", true);
        expect(updatedResA.permissions.canUploadPI).toBe(true);
        expect(updatedResA.user.customPermissions?.canUploadPI).toBe(true);

        updateUserPermission(userA.id, "module:cutting", false);

        // 3. Verify User A now has the customized permissions, but User B DOES NOT
        const freshA = findUserByUsernameOrEmail("operator_a")!;
        const freshB = findUserByUsernameOrEmail("operator_b")!;

        const effectiveA = getUserEffectivePermissions(freshA);
        const effectiveB = getUserEffectivePermissions(freshB);

        expect(effectiveA.canUploadPI).toBe(true);
        expect(effectiveA.allowedModules).not.toContain("cutting");
        expect(freshA.assignedStages).not.toContain("Cutting");

        // User B remains unchanged on Operator defaults
        expect(effectiveB.canUploadPI).toBe(false);
        expect(effectiveB.allowedModules).toContain("cutting");

        // 4. Reset User A back to role defaults
        const resetRes = resetUserPermissions(userA.id);
        expect(resetRes.user.customPermissions).toBeUndefined();
        expect(resetRes.permissions.canUploadPI).toBe(false);
        expect(resetRes.permissions.allowedModules).toContain("cutting");
      } finally {
        // Clean up
        deleteUser(userA.id);
        deleteUser(userB.id);
      }
    });
  });
});

