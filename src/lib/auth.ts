/**
 * Auth.js (NextAuth v5) with Sign In with LinkedIn via OpenID Connect (§4.4).
 *
 * Scopes: `openid profile email` — nothing more. The OIDC response gives us
 * name, given_name, family_name, picture and email. It does NOT include company
 * or job title (LinkedIn's consumer sign-in simply doesn't expose them), so we
 * auto-fill name + photo only and leave title/company as manual fields (§4.4).
 *
 * The provider is only registered when credentials are present, so the app
 * builds and runs without LinkedIn configured.
 */

import NextAuth, { type NextAuthConfig } from "next-auth";

const linkedInConfigured =
  !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET;

const providers: NextAuthConfig["providers"] = linkedInConfigured
  ? [
      {
        id: "linkedin",
        name: "LinkedIn",
        type: "oidc",
        issuer: "https://www.linkedin.com/oauth",
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        authorization: { params: { scope: "openid profile email" } },
        // LinkedIn's userinfo returns name/picture/email; we surface those only.
        profile(profile: {
          sub: string;
          name?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
          email?: string;
        }) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      },
    ]
  : [];

export const authConfig: NextAuthConfig = {
  providers,
  callbacks: {
    async jwt({ token, profile }) {
      // Stash the LinkedIn picture URL so we can re-host it on first login (§4.4).
      if (profile && "picture" in profile && typeof profile.picture === "string") {
        token.linkedInPicture = profile.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.linkedInPicture) {
        (session as { linkedInPicture?: string }).linkedInPicture =
          token.linkedInPicture as string;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export const isLinkedInConfigured = linkedInConfigured;
