import { postJSON } from "./http";

export type OAuth2TokenRequest =
  | {
      grant_type: "client_credentials";
      client_id: string;
      client_secret: string;
      scope?: string;
    }
  | {
      grant_type: "authorization_code";
      client_id: string;
      client_secret?: string;
      code: string;
      redirect_uri?: string;
      code_verifier?: string;
    }
  | {
      grant_type: "refresh_token";
      client_id?: string;
      client_secret?: string;
      refresh_token: string;
      scope?: string;
    };

export type OAuth2TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

/**
 * POST /oauth2/token — RFC 6749 compliant token endpoint (canonical).
 * Backend: server.go v1.Post("/oauth2/token", IssueOAuth2Token) and alias /oauth/token.
 * Accepts application/x-www-form-urlencoded OR JSON. This helper uses JSON for
 * simplicity; backend handles both via c.BodyParser.
 */
export async function issueOAuth2Token(req: OAuth2TokenRequest): Promise<OAuth2TokenResponse> {
  return postJSON<OAuth2TokenResponse>("/oauth2/token", req);
}

/** @deprecated use issueOAuth2Token (POST /oauth2/token). Alias kept for backend compat. */
export async function issueOAuthTokenLegacy(req: OAuth2TokenRequest): Promise<OAuth2TokenResponse> {
  return postJSON<OAuth2TokenResponse>("/oauth/token", req);
}
