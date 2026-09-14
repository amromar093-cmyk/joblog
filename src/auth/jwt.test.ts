import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "./jwt";

describe("signToken / verifyToken", () => {
  it("round-trips the payload through a signed token", () => {
    const token = signToken({ userId: "user_123" });
    expect(verifyToken(token)).toEqual({ userId: "user_123" });
  });

  it("rejects a token signed with a different secret", () => {
    const foreignToken = jwt.sign({ userId: "user_123" }, "some-other-secret-entirely");
    expect(verifyToken(foreignToken)).toBeNull();
  });

  it("rejects garbage input instead of throwing", () => {
    expect(verifyToken("not.a.real.token")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("rejects an already-expired token", () => {
    const expired = jwt.sign({ userId: "user_123" }, process.env.JWT_SECRET!, { expiresIn: -10 });
    expect(verifyToken(expired)).toBeNull();
  });

  it("rejects a validly-signed token with no userId in it", () => {
    const noUserId = jwt.sign({ somethingElse: true }, process.env.JWT_SECRET!);
    expect(verifyToken(noUserId)).toBeNull();
  });
});
