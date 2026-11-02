// Proxy пускає без входу лише точні публічні шляхи та їхні підсегменти (PUBLIC_PATHS у src/lib/supabase/proxy.ts).
import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/proxy";

describe("isPublicPath", () => {
  it("пускає без входу сторінку входу, /auth/… і /api/health", () => {
    for (const path of ["/login", "/login/", "/auth", "/auth/confirm", "/api/health"]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("не пускає шляхи, що лише починаються так само, і сторінки порталу", () => {
    for (const path of ["/loginfoo", "/authorize", "/api/health-admin", "/api", "/", "/requests", "/approvals"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
