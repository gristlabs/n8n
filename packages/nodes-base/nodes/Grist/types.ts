export type GristCredentials = {
	apiKey?: string;
	url?: string;
	oauthTokenData?: { access_token?: string };
	// Legacy API-key credential fields, superseded by `url`:
	planType?: 'free' | 'paid' | 'selfHosted';
	customSubdomain?: string;
	selfHostedUrl?: string;
};

export type GristColumns = {
	columns: Array<{ id: string }>;
};

export type GristSortProperties = Array<{
	field: string;
	direction: 'asc' | 'desc';
}>;

export type GristFilterProperties = Array<{
	field: string;
	values: string;
}>;

export type GristGetAllOptions = {
	sort?: { sortProperties: GristSortProperties };
	filter?: { filterProperties: GristFilterProperties };
};

export type GristDefinedFields = Array<{
	fieldId: string;
	fieldValue: string;
}>;

export type GristCreateRowPayload = {
	records: Array<{
		fields: { [key: string]: any };
	}>;
};

export type GristUpdateRowPayload = {
	records: Array<{
		id: number;
		fields: { [key: string]: any };
	}>;
};

export type SendingOptions = 'defineInNode' | 'autoMapInputs';

export type FieldsToSend = { properties: GristDefinedFields };

export type GristWebhookList = {
	webhooks: Array<{ id: string; fields?: { url?: string } }>;
};

export type GristWebhookCreated = {
	webhooks: Array<{ id: string }>;
};
