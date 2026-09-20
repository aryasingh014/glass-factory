import { describe, it, expect } from "vitest";
import { generateToken, generateUserToken, verifyToken } from "./auth";
import { 
  findUserByUsernameOrEmail, 
  validatePassword, 
  hashPassword, 
  getUserProfile, 
  usersDatabase 
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
      expect(payload?.email).toBe("admin@sejalglass.com");
    });

    it("should reject tampered or invalid tokens", () => {
      const token = generateToken("Operator");
      const tampered = token.slice(0, -5) + "abcde";
      expect(verifyToken(tampered)).toBeNull();
      expect(verifyToken("invalid.token.string")).toBeNull();
    });
  });

  describe("Real User Authentication for 3 Roles", () => {
    it("should authenticate Admin role with valid credentials", () => {
      const user = findUserByUsernameOrEmail("admin");
      expect(user).toBeDefined();
      expect(user?.role).toBe("Admin");
      expect(validatePassword(user!, "Admin@123")).toBe(true);
      expect(validatePassword(user!, "WrongPass@123")).toBe(false);
    });

    it("should authenticate Supervisor role with valid credentials", () => {
      const user = findUserByUsernameOrEmail("supervisor@sejalglass.com");
      expect(user).toBeDefined();
      expect(user?.role).toBe("Supervisor");
      expect(validatePassword(user!, "Supervisor@123")).toBe(true);
      expect(validatePassword(user!, "InvalidPass")).toBe(false);
    });

    it("should authenticate Operator role with valid credentials", () => {
      const user = findUserByUsernameOrEmail("operator");
      expect(user).toBeDefined();
      expect(user?.role).toBe("Operator");
      expect(validatePassword(user!, "Operator@123")).toBe(true);
      expect(validatePassword(user!, "WrongPassword")).toBe(false);
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
});


