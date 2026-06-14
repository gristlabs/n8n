import { mock } from 'jest-mock-extended';
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { Grist } from '../Grist.node';

describe('Grist execute (v2 resourceMapper)', () => {
	const setup = (params: Record<string, unknown>) => {
		const request = jest.fn().mockResolvedValue({ records: [{ id: 7 }] });

		const execFns = mock<IExecuteFunctions>();
		execFns.helpers = {
			...execFns.helpers,
			request,
			returnJsonArray: (data) =>
				(Array.isArray(data) ? data : [data]).map((json) => ({ json: json as IDataObject })),
			constructExecutionMetaData: (data) => data as never,
		};
		execFns.getInputData.mockReturnValue([{ json: {} }]);
		execFns.getNode.mockReturnValue({ typeVersion: 2 } as ReturnType<IExecuteFunctions['getNode']>);
		execFns.continueOnFail.mockReturnValue(false);
		execFns.getCredentials.mockResolvedValue({
			apiKey: 'key',
			url: 'https://api.getgrist.com',
		});

		const allParams: Record<string, unknown> = {
			authentication: 'apiKey',
			docId: 'doc1',
			tableId: 'Table1',
			...params,
		};
		(execFns.getNodeParameter as jest.Mock).mockImplementation(
			(name: string, _i?: number, fallback?: unknown) =>
				name in allParams ? allParams[name] : fallback,
		);

		return { execFns, request };
	};

	it('create posts the mapped column values', async () => {
		const { execFns, request } = setup({
			operation: 'create',
			'columns.value': { Name: 'Ada', Age: 36 },
		});

		await new Grist().execute.call(execFns);

		const options = request.mock.calls[0][0];
		expect(options.method).toBe('POST');
		expect(options.uri).toBe('https://api.getgrist.com/api/docs/doc1/tables/Table1/records');
		expect(options.body).toEqual({ records: [{ fields: { Name: 'Ada', Age: 36 } }] });
	});

	it('update patches the mapped column values for the given row ID', async () => {
		const { execFns, request } = setup({
			operation: 'update',
			rowId: '7',
			'columns.value': { Name: 'Grace' },
		});

		await new Grist().execute.call(execFns);

		const options = request.mock.calls[0][0];
		expect(options.method).toBe('PATCH');
		expect(options.body).toEqual({ records: [{ id: 7, fields: { Name: 'Grace' } }] });
	});

	it('upsert puts require (from matching columns) plus full fields', async () => {
		const { execFns, request } = setup({
			operation: 'upsert',
			'columns.value': { Email: 'a@b.c', Name: 'Ada' },
			'columns.matchingColumns': ['Email'],
		});

		await new Grist().execute.call(execFns);

		const options = request.mock.calls[0][0];
		expect(options.method).toBe('PUT');
		expect(options.uri).toBe('https://api.getgrist.com/api/docs/doc1/tables/Table1/records');
		expect(options.body).toEqual({
			records: [{ require: { Email: 'a@b.c' }, fields: { Email: 'a@b.c', Name: 'Ada' } }],
		});
	});
});
