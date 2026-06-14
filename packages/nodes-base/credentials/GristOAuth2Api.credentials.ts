import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// Grist's OAuth server requires PKCE for every client and issues confidential
// clients (client ID + secret). Requesting `offline_access` only yields a
// refresh token when the authorization request also sends `prompt=consent`,
// so that is pinned in `authQueryParameters`.
const scopes = [
	'openid',
	'email',
	'profile',
	'offline_access',
	'doc:read',
	'doc:write',
	'doc:webhooks',
	'user.profile:read',
];

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
			displayName: 'Grist URL',
			name: 'url',
			type: 'string',
			default: 'https://docs.getgrist.com',
			description:
				'Base URL of your Grist instance, without a trailing slash. Leave the default for hosted Grist; for a self-managed instance with OAuth Apps enabled, enter its URL (e.g. https://grist.example.com).',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$self["url"]}}/oidc/auth',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$self["url"]}}/oidc/token',
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
