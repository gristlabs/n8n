<template>
	<div @keydown.stop class="variable-selector-wrapper">
		<div class="input-wrapper">
			<el-input placeholder="Variable filter..." v-model="variableFilter" ref="inputField" size="small" type="text"></el-input>
		</div>

		<div class="result-wrapper">
			<variable-selector-item :item="option" v-for="option in currentResults" :key="option.key" :extendAll="extendAll" @itemSelected="forwardItemSelected"></variable-selector-item>
		</div>
	</div>
</template>

<script lang="ts">

import {
	PLACEHOLDER_FILLED_AT_EXECUTION_TIME,
} from '@/constants';

import {
	GenericValue,
	IContextObject,
	IDataObject,
	IRunData,
	IRunExecutionData,
	IWorkflowDataProxyAdditionalKeys,
	Workflow,
	WorkflowDataProxy,
} from 'n8n-workflow';

import VariableSelectorItem from '@/components/VariableSelectorItem.vue';
import {
	IExecutionResponse,
	INodeUi,
	IVariableItemSelected,
	IVariableSelectorOption,
} from '@/Interface';

import { workflowHelpers } from '@/components/mixins/workflowHelpers';

import mixins from 'vue-typed-mixins';

export default mixins(
	workflowHelpers,
)
	.extend({
		name: 'VariableSelector',
		components: {
			VariableSelectorItem,
		},
		props: [
			'path',
		],
		data () {
			return {
				variableFilter: '',
				selectorOpenInputIndex: null as number | null,
			};
		},
		computed: {
			extendAll (): boolean {
				if (this.variableFilter) {
					return true;
				}

				return false;
			},
			currentResults (): IVariableSelectorOption[] {
				return this.getFilterResults(this.variableFilter.toLowerCase(), 0);
			},
			workflow (): Workflow {
				return this.getWorkflow();
			},
		},
		methods: {
			forwardItemSelected (eventData: IVariableItemSelected) {
				this.$emit('itemSelected', eventData);
			},
			sortOptions (options: IVariableSelectorOption[] | null): IVariableSelectorOption[] | null {
				if (options === null) {
					return null;
				}
				return options.sort((a: IVariableSelectorOption, b: IVariableSelectorOption) => {
					const aHasOptions = a.hasOwnProperty('options');
					const bHasOptions = b.hasOwnProperty('options');

					if (bHasOptions && !aHasOptions) {
						// When b has options but a not list it first
						return 1;
					} else if (!bHasOptions && aHasOptions) {
						// When a has options but b not list it first
						return -1;
					}

					// Else simply sort alphabetically
					if (a.name < b.name) { return -1; }
					if (a.name > b.name) { return 1; }
					return 0;
				});
			},
			removeEmptyEntries (inputData: IVariableSelectorOption[] | IVariableSelectorOption | null): IVariableSelectorOption[] | IVariableSelectorOption | null {
				if (Array.isArray(inputData)) {
					const newItems: IVariableSelectorOption[] = [];
					let tempItem: IVariableSelectorOption;
					inputData.forEach((item) => {
						tempItem = this.removeEmptyEntries(item) as IVariableSelectorOption;
						if (tempItem !== null) {
							newItems.push(tempItem);
						}
					});
					return newItems;
				}

				if (inputData && inputData.options) {
					const newOptions = this.removeEmptyEntries(inputData.options);
					if (Array.isArray(newOptions) && newOptions.length) {
						// Has still options left so return
						inputData.options = this.sortOptions(newOptions);
						return inputData;
					} else if (Array.isArray(newOptions) && newOptions.length === 0) {
						delete inputData.options;
						return inputData;
					}
					// Has no options left so remove
					return null;
				} else {
					// Is an item no category
					return inputData;
				}
			},
			// Normalizes the path so compare paths which have use dots or brakets
			getPathNormalized (path: string | undefined): string {
				if (path === undefined) {
					return '';
				}
				const pathArray = path.split('.');

				const finalArray = [];
				let item: string;
				for (const pathPart of pathArray) {
					const pathParts = pathPart.match(/\[.*?\]/g);
					if (pathParts === null) {
						// Does not have any brakets so add as it is
						finalArray.push(pathPart);
					} else {
						// Has brakets so clean up the items and add them
						if (pathPart.charAt(0) !== '[') {
							// Does not start with a braket so there is a part before
							// we have to add
							finalArray.push(pathPart.substr(0, pathPart.indexOf('[')));
						}

						for (item of pathParts) {
							item = item.slice(1, -1);
							if (['"', "'"].includes(item.charAt(0))) {
								// Is a string
								item = item.slice(1, -1);
								finalArray.push(item);
							} else {
								// Is a number
								finalArray.push(`[${item}]`);
							}
						}
					}
				}

				return finalArray.join('|');
			},
			jsonDataToFilterOption (inputData: IDataObject | GenericValue | IDataObject[] | GenericValue[] | null, parentPath: string, propertyName: string, filterText?: string, propertyIndex?: number, displayName?: string, skipKey?: string): IVariableSelectorOption[] {
				let fullpath = `${parentPath}["${propertyName}"]`;
				if (propertyIndex !== undefined) {
					fullpath += `[${propertyIndex}]`;
				}

				const returnData: IVariableSelectorOption[] = [];
				if (inputData === null) {
					returnData.push(
						{
							name: propertyName,
							key: fullpath,
							value: '[null]',
						} as IVariableSelectorOption,
					);
					return returnData;
				} else if (Array.isArray(inputData)) {
					let newPropertyName = propertyName;
					let newParentPath = parentPath;
					if (propertyIndex !== undefined) {
						newParentPath += `["${propertyName}"]`;
						newPropertyName = propertyIndex.toString();
					}

					const arrayData: IVariableSelectorOption[] = [];

					for (let i = 0; i < inputData.length; i++) {
						arrayData.push.apply(arrayData, this.jsonDataToFilterOption(inputData[i], newParentPath, newPropertyName, filterText, i, `[Item: ${i}]`, skipKey));
					}

					returnData.push(
						{
							name: displayName || propertyName,
							options: arrayData,
							key: fullpath,
							allowParentSelect: true,
							dataType: 'array',
						} as IVariableSelectorOption,
					);
				} else if (typeof inputData === 'object') {
					const tempValue: IVariableSelectorOption[] = [];

					for (const key of Object.keys(inputData)) {
						tempValue.push.apply(tempValue, this.jsonDataToFilterOption((inputData as IDataObject)[key], fullpath, key, filterText, undefined, undefined, skipKey));
					}

					if (tempValue.length) {
						returnData.push(
							{
								name: displayName || propertyName,
								options: this.sortOptions(tempValue),
								key: fullpath,
								allowParentSelect: true,
								dataType: 'object',
							} as IVariableSelectorOption,
						);
					}
				} else {
					if (filterText !== undefined && propertyName.toLowerCase().indexOf(filterText) === -1) {
						return returnData;
					}

					// Skip is currently only needed for leafs so only check here
					if (this.getPathNormalized(skipKey) !== this.getPathNormalized(fullpath)) {
						returnData.push(
							{
								name: propertyName,
								key: fullpath,
								value: inputData,
							} as IVariableSelectorOption,
						);
					}
				}

				return returnData;
			},

			/**
			 * Returns the data the a node does output
			 *
			 * @param {IRunData} runData The data of the run to get the data of
			 * @param {string} nodeName The name of the node to get the data of
			 * @param {string} filterText Filter text for parameters
			 * @param {number} [itemIndex=0] The index of the item
			 * @param {number} [runIndex=0] The index of the run
			 * @param {string} [inputName='main'] The name of the input
			 * @param {number} [outputIndex=0] The index of the output
			 * @returns
			 * @memberof Workflow
			 */
			getNodeOutputData (runData: IRunData, nodeName: string, filterText: string, itemIndex = 0, runIndex = 0, inputName = 'main', outputIndex = 0, useShort = false): IVariableSelectorOption[] | null {
				if (!runData.hasOwnProperty(nodeName)) {
					// No data found for node
					return null;
				}

				if (runData[nodeName].length <= runIndex) {
					// No data for given runIndex
					return null;
				}

				if (!runData[nodeName][runIndex].hasOwnProperty('data') ||
					runData[nodeName][runIndex].data === null ||
					runData[nodeName][runIndex].data === undefined) {
					// Data property does not exist or is not set (even though it normally has to)
					return null;
				}

				if (!runData[nodeName][runIndex].data!.hasOwnProperty(inputName)) {
					// No data found for inputName
					return null;
				}

				if (runData[nodeName][runIndex].data![inputName].length <= outputIndex) {
					// No data found for output Index
					return null;
				}

				// The data should be identical no matter to which node it gets so always select the first one
				if (runData[nodeName][runIndex].data![inputName][outputIndex] === null ||
					runData[nodeName][runIndex].data![inputName][outputIndex]!.length <= itemIndex) {
					// No data found for node connection found
					return null;
				}

				const outputData = runData[nodeName][runIndex].data![inputName][outputIndex]![itemIndex];

				const returnData: IVariableSelectorOption[] = [];

				// Get json data
				if (outputData.hasOwnProperty('json')) {

					const jsonPropertyPrefix = useShort === true ? '$json' : `$node["${nodeName}"].json`;

					const jsonDataOptions: IVariableSelectorOption[] = [];
					for (const propertyName of Object.keys(outputData.json)) {
						jsonDataOptions.push.apply(jsonDataOptions, this.jsonDataToFilterOption(outputData.json[propertyName], jsonPropertyPrefix, propertyName, filterText));
					}

					if (jsonDataOptions.length) {
						returnData.push(
							{
								name: 'JSON',
								options: this.sortOptions(jsonDataOptions),
							},
						);
					}
				}

				// Get binary data
				if (outputData.hasOwnProperty('binary')) {

					const binaryPropertyPrefix = useShort === true ? '$binary' : `$node["${nodeName}"].binary`;

					const binaryData = [];
					let binaryPropertyData = [];

					for (const dataPropertyName of Object.keys(outputData.binary!)) {
						binaryPropertyData = [];
						for (const propertyName in outputData.binary![dataPropertyName]) {
							if (propertyName === 'data') {
								continue;
							}

							if (filterText && propertyName.toLowerCase().indexOf(filterText) === -1) {
								// If filter is set apply it
								continue;
							}

							binaryPropertyData.push(
								{
									name: propertyName,
									key: `${binaryPropertyPrefix}.${dataPropertyName}.${propertyName}`,
									value: outputData.binary![dataPropertyName][propertyName],
								},
							);
						}

						if (binaryPropertyData.length) {
							binaryData.push(
								{
									name: dataPropertyName,
									key: `${binaryPropertyPrefix}.${dataPropertyName}`,
									options: this.sortOptions(binaryPropertyData),
									allowParentSelect: true,
								},
							);
						}
					}
					if (binaryData.length) {
						returnData.push(
							{
								name: 'Binary',
								key: binaryPropertyPrefix,
								options: this.sortOptions(binaryData),
								allowParentSelect: true,
							},
						);
					}
				}

				return returnData;
			},
			getNodeContext (workflow: Workflow, runExecutionData: IRunExecutionData | null, parentNode: string[], nodeName: string, filterText: string): IVariableSelectorOption[] | null {
				const inputIndex = 0;
				const itemIndex = 0;
				const inputName = 'main';
				const runIndex = 0;
				const returnData: IVariableSelectorOption[] = [];

				const connectionInputData = this.connectionInputData(parentNode, inputName, runIndex, inputIndex);

				if (connectionInputData === null) {
					return returnData;
				}

				const additionalKeys: IWorkflowDataProxyAdditionalKeys = {
					$executionId: PLACEHOLDER_FILLED_AT_EXECUTION_TIME,
					$resumeWebhookUrl: PLACEHOLDER_FILLED_AT_EXECUTION_TIME,
				};

				const dataProxy = new WorkflowDataProxy(workflow, runExecutionData, runIndex, itemIndex, nodeName, connectionInputData, {}, 'manual', additionalKeys);
				const proxy = dataProxy.getDataProxy();

				// @ts-ignore
				const nodeContext = proxy.$node[nodeName].context as IContextObject;
				for (const key of Object.keys(nodeContext)) {
					if (filterText !== undefined && key.toLowerCase().indexOf(filterText) === -1) {
						// If filter is set apply it
						continue;
					}

					returnData.push({
						name: key,
						key: `$node["${nodeName}"].context["${key}"]`,
						// @ts-ignore
						value: nodeContext[key],
					});
				}

				return returnData;
			},
			/**
			 * Returns all the node parameters with values
			 *
			 * @param {string} nodeName The name of the node to return data of
			 * @param {string} path The path to the node to pretend to key
			 * @param {string} [skipParameter] Parameter to skip
			 * @param {string} [filterText] Filter text for parameters
			 * @returns
			 * @memberof Workflow
			 */
			getNodeParameters (nodeName: string, path: string, skipParameter?: string, filterText?: string): IVariableSelectorOption[] | null {
				const node = this.workflow.getNode(nodeName);
				if (node === null) {
					return null;
				}

				const returnParameters: IVariableSelectorOption[] = [];
				for (const parameterName in node.parameters) {
					if (parameterName === skipParameter) {
						// Skip the parameter
						continue;
					}

					if (filterText !== undefined && parameterName.toLowerCase().indexOf(filterText) === -1) {
						// If filter is set apply it
						continue;
					}

					returnParameters.push.apply(returnParameters, this.jsonDataToFilterOption(node.parameters[parameterName], path, parameterName, filterText, undefined, undefined, skipParameter));
				}

				return returnParameters;
			},
			getFilterResults (filterText: string, itemIndex: number): IVariableSelectorOption[] {
				const inputName = 'main';

				const activeNode: INodeUi | null = this.$store.getters.activeNode;

				if (activeNode === null) {
					return [];
				}

				const executionData = this.$store.getters.getWorkflowExecution as IExecutionResponse | null;
				let parentNode = this.workflow.getParentNodes(activeNode.name, inputName, 1);
				let runData = this.$store.getters.getWorkflowRunData as IRunData | null;

				if (runData === null) {
					runData = {};
				}

				let returnData: IVariableSelectorOption[] | null = [];
				// -----------------------------------------
				// Add the parameters of the current node
				// -----------------------------------------

				// Add the parameters
				const currentNodeData: IVariableSelectorOption[] = [];

				let tempOptions: IVariableSelectorOption[];
				if (executionData !== null) {
					const runExecutionData: IRunExecutionData = executionData.data;

					tempOptions = this.getNodeContext(this.workflow, runExecutionData, parentNode, activeNode.name, filterText) as IVariableSelectorOption[];
					if (tempOptions.length) {
						currentNodeData.push(
							{
								name: 'Context',
								options: this.sortOptions(tempOptions),
							} as IVariableSelectorOption,
						);
					}
				}

				let tempOutputData;

				if (parentNode.length) {
					// If the node has an input node add the input data

					// Check from which output to read the data.
					// Depends on how the nodes are connected.
					// (example "IF" node. If node is connected to "true" or to "false" output)
					const outputIndex = this.workflow.getNodeConnectionOutputIndex(activeNode.name, parentNode[0], 'main');

					tempOutputData = this.getNodeOutputData(runData, parentNode[0], filterText, itemIndex, 0, 'main', outputIndex, true) as IVariableSelectorOption[];

					if (tempOutputData) {
						if (JSON.stringify(tempOutputData).length < 102400) {
							// Data is reasonable small (< 100kb) so add it
							currentNodeData.push(
								{
									name: 'Input Data',
									options: this.sortOptions(tempOutputData),
								},
							);
						} else {
							// Data is to large so do not add
							currentNodeData.push(
								{
									name: 'Input Data',
									options: [
										{
											name: '[Data to large]',
										},
									],
								},
							);
						}
					}
				}

				const initialPath = '$parameter';
				let skipParameter = this.path;
				if (skipParameter.startsWith('parameters.')) {
					skipParameter = initialPath + skipParameter.substring(10);
				}

				currentNodeData.push(
					{
						name: 'Parameters',
						options: this.sortOptions(this.getNodeParameters(activeNode.name, initialPath, skipParameter, filterText) as IVariableSelectorOption[]),
					},
				);

				returnData.push(
					{
						name: 'Current Node',
						options: this.sortOptions(currentNodeData),
					},
				);

				// Add the input data

				// -----------------------------------------
				// Add all the nodes and their data
				// -----------------------------------------
				const allNodesData: IVariableSelectorOption[] = [];
				let nodeOptions: IVariableSelectorOption[];
				const upstreamNodes = this.workflow.getParentNodes(activeNode.name, inputName);

				for (const nodeName of Object.keys(this.workflow.nodes)) {
					// Add the parameters of all nodes
					// TODO: Later have to make sure that no parameters can be referenced which have expression which use input-data (for nodes which are not parent nodes)

					if (nodeName === activeNode.name) {
						// Skip the current node as this one get added separately
						continue;
					}

					nodeOptions = [
						{
							name: 'Parameters',
							options: this.sortOptions(this.getNodeParameters(nodeName, `$node["${nodeName}"].parameter`, undefined, filterText)),
						} as IVariableSelectorOption,
					];

					if (executionData !== null) {
						const runExecutionData: IRunExecutionData = executionData.data;

						parentNode = this.workflow.getParentNodes(nodeName, inputName, 1);
						tempOptions = this.getNodeContext(this.workflow, runExecutionData, parentNode, nodeName, filterText) as IVariableSelectorOption[];
						if (tempOptions.length) {
							nodeOptions = [
								{
									name: 'Context',
									options: this.sortOptions(tempOptions),
								} as IVariableSelectorOption,
							];
						}
					}

					if (upstreamNodes.includes(nodeName)) {
						// If the node is an upstream node add also the output data which can be referenced
						tempOutputData = this.getNodeOutputData(runData, nodeName, filterText, itemIndex);
						if (tempOutputData) {
							nodeOptions.push(
								{
									name: 'Output Data',
									options: this.sortOptions(tempOutputData),
								} as IVariableSelectorOption,
							);
						}
					}

					allNodesData.push(
						{
							name: nodeName,
							options: this.sortOptions(nodeOptions),
						},
					);
				}

				returnData.push(
					{
						name: 'Nodes',
						options: this.sortOptions(allNodesData),
					},
				);

				// Remove empty entries and return
				returnData = this.removeEmptyEntries(returnData) as IVariableSelectorOption[] | null;

				if (returnData === null) {
					return [];
				}

				return returnData;
			},
		},
	});
</script>

<style scoped lang="scss">

.variable-selector-wrapper {
	border-radius: 0 0 4px 4px;
	width: 100%;
	height: 100%;
	position: relative;
}

.result-wrapper {
	line-height: 1em;
	height: 370px;
	overflow-x: hidden;
	overflow-y: auto;
	margin: 0.5em 0;
	width: 100%;
}

.result-item {
	font-size: 0.7em;
}

</style>
