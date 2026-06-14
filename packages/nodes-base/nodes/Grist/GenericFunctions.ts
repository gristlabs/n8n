import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IRequestOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type {
	GristColumns,
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

export function gristApiKeyBaseUrl(credentials: GristCredentials): string {
	if (credentials.planType === 'free') {
		return 'https://docs.getgrist.com';
	}
	if (credentials.planType === 'paid') {
		return `https://${credentials.customSubdomain}.getgrist.com`;
	}
	return (credentials.selfHostedUrl ?? '').replace(/\/$/, '');
}

export async function gristApiRequest(
	this: GristRequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | number[] = {},
	qs: IDataObject = {},
) {
	const authentication = this.getNodeParameter('authentication', 0) as string;

	const options: IRequestOptions = {
		method,
		uri: '',
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
			const credentials = await this.getCredentials('gristOAuth2Api');
			const baseUrl = (credentials.url as string).replace(/\/$/, '');
			options.uri = `${baseUrl}/api${endpoint}`;
			return await this.helpers.requestOAuth2.call(this, 'gristOAuth2Api', options);
		}

		const credentials = await this.getCredentials<GristCredentials>('gristApi');
		options.uri = `${gristApiKeyBaseUrl(credentials)}/api${endpoint}`;
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
