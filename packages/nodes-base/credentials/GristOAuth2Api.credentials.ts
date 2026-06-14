import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// Grist's OAuth server requires PKCE for every client and issues confidential
// clients (client ID + secret). Requesting `offline_access` only yields a
// refresh token when the authorization request also sends `prompt=consent`,
// so that is pinned in `authQueryParameters`.
// Resource scopes from Grist's OAuth-apps authorization server
// (/.well-known/oauth-authorization-server). The identity scopes (openid/email/
// profile) belong to the separate Sign-in-with-Grist server and are not valid here.
const scopes = ['offline_access', 'doc:read', 'doc:write', 'doc:webhooks'];

export class GristOAuth2Api implements ICredentialType {
	name = 'gristOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Grist OAuth2 API';

	documentationUrl = 'grist';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		{
			displayName: 'Self-Hosted URL',
			name: 'selfHostedUrl',
			type: 'string',
			default: '',
			placeholder: 'https://grist.example.com',
			description:
				'Leave blank for hosted Grist. For a self-managed instance with OAuth Apps enabled, enter its URL (without /api and no trailing slash).',
		},
		{
			// Hosted Grist serves the OAuth endpoints from login.getgrist.com (the issuer) and the
			// REST API from api.getgrist.com; a self-managed instance serves both from its own URL.
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$self["selfHostedUrl"] || "https://login.getgrist.com"}}/oidc/auth',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$self["selfHostedUrl"] || "https://login.getgrist.com"}}/oidc/token',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: scopes.join(' '),
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: 'prompt=consent',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}
