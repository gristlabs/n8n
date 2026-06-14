import type {
	FieldType,
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IRequestOptions,
	IWebhookFunctions,
	JsonObject,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type {
	GristColumns,
	GristColumnSchema,
	GristCredentials,
	GristDefinedFields,
	GristFilterProperties,
	GristSortProperties,
} from './types';

export type GristRequestContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

// Legacy API-key credential host resolution (free → docs, paid → team subdomain,
// self-hosted → entered URL), used as a fallback for credentials created before the
// single `url` field below.
function gristLegacyBaseUrl(credentials: GristCredentials): string {
	if (credentials.planType === 'free') {
		return 'https://docs.getgrist.com';
	}
	if (credentials.planType === 'paid') {
		return `https://${credentials.customSubdomain}.getgrist.com`;
	}
	return (credentials.selfHostedUrl ?? '').replace(/\/$/, '');
}

// Resolve the Grist server base URL for either credential type. Credentials store a
// single `url`; legacy API-key credentials fall back to their plan-type fields.
// Defaults to the SaaS API host, which serves every hosted account.
export function gristBaseUrl(credentials: GristCredentials): string {
	if (credentials.url) {
		return credentials.url.replace(/\/$/, '');
	}
	return gristLegacyBaseUrl(credentials) || 'https://api.getgrist.com';
}

export async function gristApiRequest(
	this: GristRequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | number[] = {},
	qs: IDataObject = {},
) {
	const authentication = this.getNodeParameter('authentication', 0) as string;
	const credentialsType = authentication === 'oAuth2' ? 'gristOAuth2Api' : 'gristApi';
	const credentials = await this.getCredentials<GristCredentials>(credentialsType);

	const options: IRequestOptions = {
		method,
		uri: `${gristBaseUrl(credentials)}/api${endpoint}`,
		qs,
		body,
		json: true,
	};

	if (!Object.keys(body).length) {
		delete options.body;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	try {
		if (authentication === 'oAuth2') {
			return await this.helpers.requestOAuth2.call(this, 'gristOAuth2Api', options);
		}
		options.headers = { Authorization: `Bearer ${credentials.apiKey}` };
		return await this.helpers.request(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export async function getTableColumns(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const docId = this.getNodeParameter('docId', 0) as string;
	const tableId = this.getNodeParameter('tableId', 0) as string;
	const { columns } = (await gristApiRequest.call(
		this,
		'GET',
		`/docs/${docId}/tables/${tableId}/columns`,
	)) as GristColumns;
	return columns.map(({ id }) => ({ name: id, value: id }));
}

// Grist column types may carry a suffix, e.g. `Ref:Table1` or `DateTime:UTC`,
// so we match on the prefix before the colon.
function mapGristColumnType(gristType?: string): FieldType {
	const baseType = (gristType ?? '').split(':')[0];
	switch (baseType) {
		case 'Numeric':
		case 'Int':
			return 'number';
		case 'Bool':
			return 'boolean';
		case 'Date':
		case 'DateTime':
			return 'dateTime';
		case 'Choice':
			return 'options';
		case 'ChoiceList':
		case 'RefList':
		case 'Attachments':
			return 'array';
		default:
			// Text, Ref, Any and anything unrecognized map to string.
			return 'string';
	}
}

function isHiddenColumn(id: string): boolean {
	return id === 'manualSort' || id.startsWith('gristHelper_');
}

export async function getMappingColumns(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const docId = this.getNodeParameter('docId', 0) as string;
	const tableId = this.getNodeParameter('tableId', 0) as string;
	const { columns } = (await gristApiRequest.call(
		this,
		'GET',
		`/docs/${docId}/tables/${tableId}/columns`,
	)) as GristColumnSchema;

	const fields = columns
		.filter(({ id }) => !isHiddenColumn(id))
		.map(({ id, fields: col }) => ({
			id,
			displayName: col.label ?? id,
			type: mapGristColumnType(col.type),
			// Pure formula columns aren't writable; trigger formulas (isFormula false) are.
			readOnly: col.isFormula === true,
			required: false,
			defaultMatch: false,
			display: true,
			canBeUsedToMatch: true,
		}));

	return { fields };
}

export function parseSortProperties(sortProperties: GristSortProperties) {
	return sortProperties.reduce((acc, cur, curIdx) => {
		if (cur.direction === 'desc') acc += '-';
		acc += cur.field;
		if (curIdx !== sortProperties.length - 1) acc += ',';
		return acc;
	}, '');
}

export function isSafeInteger(val: number) {
	//used MIN_SAFE_INTEGER and MAX_SAFE_INTEGER instead of MIN_VALUE and MAX_VALUE to avoid edge cases
	return !isNaN(val) && val > Number.MIN_SAFE_INTEGER && val < Number.MAX_SAFE_INTEGER;
}

export function parseFilterProperties(filterProperties: GristFilterProperties) {
	return filterProperties.reduce<{ [key: string]: Array<string | number> }>((acc, cur) => {
		acc[cur.field] = acc[cur.field] ?? [];
		const values = isSafeInteger(Number(cur.values)) ? Number(cur.values) : cur.values;
		acc[cur.field].push(values);
		return acc;
	}, {});
}

export function parseDefinedFields(fieldsToSendProperties: GristDefinedFields) {
	return fieldsToSendProperties.reduce<{ [key: string]: string }>((acc, cur) => {
		acc[cur.fieldId] = cur.fieldValue;
		return acc;
	}, {});
}

export function parseAutoMappedInputs(incomingKeys: string[], inputsToIgnore: string[], item: any) {
	return incomingKeys.reduce<{ [key: string]: any }>((acc, curKey) => {
		if (inputsToIgnore.includes(curKey)) return acc;
		acc = { ...acc, [curKey]: item[curKey] };
		return acc;
	}, {});
}

export function throwOnZeroDefinedFields(this: IExecuteFunctions, fields: GristDefinedFields) {
	if (!fields?.length) {
		throw new NodeOperationError(
			this.getNode(),
			"No defined data found. Please specify the data to send in 'Fields to Send'.",
		);
	}
}
