import { OAuth2Client } from 'google-auth-library';
import { OAuthTokens } from '../types/index.js';
export declare const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export declare const DEFAULT_OAUTH_CLIENT_ID: string;
export declare const DEFAULT_OAUTH_CLIENT_SECRET: string;
export declare class OAuthManager {
    /**
     * Run the local loopback OAuth2 flow to authenticate the user and obtain refresh/access tokens.
     */
    static authenticate(clientId: string, clientSecret: string, options?: {
        timeoutMs?: number;
        openBrowser?: boolean;
    }): Promise<OAuthTokens>;
    /**
     * Instantiate an authenticated OAuth2Client instance with automatic token refreshing.
     */
    static createClient(clientId: string, clientSecret: string, tokens: OAuthTokens, onTokenRefreshed?: (updatedTokens: OAuthTokens) => void): OAuth2Client;
}
