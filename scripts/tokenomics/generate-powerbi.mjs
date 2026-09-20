import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENCY_FORMAT = '$#,##0.00;($#,##0.00);$0.00';
const PERCENT_FORMAT = '0.0%';
const DECIMAL_FORMAT = '#,##0.00';
const INTEGER_FORMAT = '#,##0';
const DATE_FORMAT = 'yyyy-MM-dd';
const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const PLACEHOLDER_SEMANTIC_MODEL_ID = '00000000-0000-0000-0000-000000000000';

const usageColumns = [
  ['event_id', 'string'],
  ['event_ts', 'dateTime', DATETIME_FORMAT],
  ['usage_date', 'dateTime', DATE_FORMAT],
  ['source_code', 'string'],
  ['model_family', 'string'],
  ['model_name', 'string'],
  ['model_version', 'string'],
  ['user_id_hash', 'string'],
  ['team_id', 'string'],
  ['department_id', 'string'],
  ['business_unit_id', 'string'],
  ['project_id', 'string'],
  ['cost_center_id', 'string'],
  ['application_id', 'string'],
  ['environment', 'string'],
  ['task_type', 'string'],
  ['request_count', 'int64', INTEGER_FORMAT],
  ['input_tokens', 'int64', INTEGER_FORMAT],
  ['cached_input_tokens', 'int64', INTEGER_FORMAT],
  ['output_tokens', 'int64', INTEGER_FORMAT],
  ['total_tokens', 'int64', INTEGER_FORMAT],
  ['reported_cost_usd', 'double', CURRENCY_FORMAT],
  ['market_cost_usd', 'double', CURRENCY_FORMAT],
  ['negotiated_cost_usd', 'double', CURRENCY_FORMAT],
  ['actual_cost_usd', 'double', CURRENCY_FORMAT],
  ['tasks_completed', 'int64', INTEGER_FORMAT],
  ['quality_score', 'double', '0.000'],
];

const insightColumns = [
  ['run_id', 'string'],
  ['scored_at', 'dateTime', DATETIME_FORMAT],
  ['event_date', 'dateTime', DATE_FORMAT],
  ['use_case_key', 'string'],
  ['use_case_name', 'string'],
  ['entity_type', 'string'],
  ['entity_id', 'string'],
  ['team_id', 'string'],
  ['user_id_hash', 'string'],
  ['project_id', 'string'],
  ['department_id', 'string'],
  ['business_unit_id', 'string'],
  ['cost_center_id', 'string'],
  ['application_id', 'string'],
  ['environment', 'string'],
  ['source_code', 'string'],
  ['model_family', 'string'],
  ['model_name', 'string'],
  ['model_version', 'string'],
  ['metric_name', 'string'],
  ['metric_value', 'double', DECIMAL_FORMAT],
  ['metric_unit', 'string'],
  ['risk_score', 'double', '0.0'],
  ['probability', 'double', PERCENT_FORMAT],
  ['predicted_cost_usd', 'double', CURRENCY_FORMAT],
  ['estimated_savings_usd', 'double', CURRENCY_FORMAT],
  ['recommendation', 'string'],
  ['scoring_model_version', 'string'],
  ['source_lineage', 'string'],
];

const priceColumns = [
  ['price_id', 'string'],
  ['snapshot_id', 'string'],
  ['source_code', 'string'],
  ['model_family', 'string'],
  ['model_name', 'string'],
  ['model_version', 'string'],
  ['effective_from', 'dateTime', DATETIME_FORMAT],
  ['effective_to', 'dateTime', DATETIME_FORMAT],
  ['is_current', 'boolean'],
  ['currency', 'string'],
  ['market_input_usd_per_million', 'double', CURRENCY_FORMAT],
  ['market_cached_input_usd_per_million', 'double', CURRENCY_FORMAT],
  ['market_output_usd_per_million', 'double', CURRENCY_FORMAT],
  ['negotiated_input_usd_per_million', 'double', CURRENCY_FORMAT],
  ['negotiated_cached_input_usd_per_million', 'double', CURRENCY_FORMAT],
  ['negotiated_output_usd_per_million', 'double', CURRENCY_FORMAT],
  ['source_name', 'string'],
  ['source_uri', 'string'],
];

const runColumns = [
  ['run_id', 'string'],
  ['use_case_key', 'string'],
  ['notebook_name', 'string'],
  ['run_type', 'string'],
  ['status', 'string'],
  ['started_at', 'dateTime', DATETIME_FORMAT],
  ['completed_at', 'dateTime', DATETIME_FORMAT],
  ['row_count', 'int64', INTEGER_FORMAT],
  ['model_version', 'string'],
  ['source_watermark', 'string'],
  ['output_table', 'string'],
];

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inlinePart(path, content) {
  return {
    path,
    payload: Buffer.from(content, 'utf8').toString('base64'),
    payloadType: 'InlineBase64',
  };
}

function modelColumn([name, dataType, formatString]) {
  return {
    name,
    dataType,
    sourceColumn: name,
    summarizeBy: 'none',
    ...(formatString ? { formatString } : {}),
  };
}

function measure(name, expression, formatString) {
  return {
    name,
    expression,
    ...(formatString ? { formatString } : {}),
  };
}

function escapeSqlIdentifier(value) {
  return value.replaceAll(']', ']]');
}

function escapeMString(value) {
  return value.replaceAll('"', '""');
}

function modelTable({ name, schema, sourceTable, columns, measures, sqlEndpointHost, databaseName }) {
  const selectList = columns.map(([column]) => `[${escapeSqlIdentifier(column)}]`).join(', ');
  const sql = `SELECT ${selectList} FROM [${escapeSqlIdentifier(schema)}].[${escapeSqlIdentifier(sourceTable)}]`;
  const source = [
    'let',
    `    Source = Sql.Database("${escapeMString(sqlEndpointHost)}", "${escapeMString(databaseName)}", [Query="${escapeMString(sql)}", CreateNavigationProperties=false])`,
    'in',
    '    Source',
  ];

  return {
    name,
    columns: columns.map(modelColumn),
    measures,
    partitions: [{
      name: `${name} DirectQuery`,
      mode: 'directQuery',
      source: { type: 'm', expression: source },
    }],
  };
}

function usageMeasures() {
  return [
    measure('Total Requests', "SUM('Usage'[request_count])", INTEGER_FORMAT),
    measure('Input Tokens', "SUM('Usage'[input_tokens])", INTEGER_FORMAT),
    measure('Cached Input Tokens', "SUM('Usage'[cached_input_tokens])", INTEGER_FORMAT),
    measure('Output Tokens', "SUM('Usage'[output_tokens])", INTEGER_FORMAT),
    measure('Total Tokens', "SUM('Usage'[total_tokens])", INTEGER_FORMAT),
    measure('Reported Cost', "SUM('Usage'[reported_cost_usd])", CURRENCY_FORMAT),
    measure('Market Cost', "SUM('Usage'[market_cost_usd])", CURRENCY_FORMAT),
    measure('Negotiated Cost', "SUM('Usage'[negotiated_cost_usd])", CURRENCY_FORMAT),
    measure('Actual Cost', "SUM('Usage'[actual_cost_usd])", CURRENCY_FORMAT),
    measure('Potential Savings', '[Market Cost] - [Negotiated Cost]', CURRENCY_FORMAT),
    measure('Cost per 1K Tokens', 'DIVIDE([Market Cost], [Total Tokens]) * 1000', CURRENCY_FORMAT),
    measure('Active Users', "DISTINCTCOUNT('Usage'[user_id_hash])", INTEGER_FORMAT),
    measure('Active Teams', "DISTINCTCOUNT('Usage'[team_id])", INTEGER_FORMAT),
    measure('Active Projects', "DISTINCTCOUNT('Usage'[project_id])", INTEGER_FORMAT),
    measure('Active Models', "DISTINCTCOUNT('Usage'[model_name])", INTEGER_FORMAT),
    measure('Completed Tasks', "SUM('Usage'[tasks_completed])", INTEGER_FORMAT),
  ];
}

function insightMeasures(entity, prefix = '') {
  const quoted = `'${entity.replaceAll("'", "''")}'`;
  const pfx = prefix ? `${prefix} ` : '';
  return [
    measure(`${pfx}Output Rows`, `COUNTROWS(${quoted})`, INTEGER_FORMAT),
    measure(`${pfx}Average Metric`, `AVERAGE(${quoted}[metric_value])`, DECIMAL_FORMAT),
    measure(`${pfx}Average Risk Score`, `AVERAGE(${quoted}[risk_score])`, '0.0'),
    measure(`${pfx}Average Probability`, `AVERAGE(${quoted}[probability])`, PERCENT_FORMAT),
    measure(`${pfx}Predicted Cost`, `SUM(${quoted}[predicted_cost_usd])`, CURRENCY_FORMAT),
    measure(`${pfx}Estimated Savings`, `SUM(${quoted}[estimated_savings_usd])`, CURRENCY_FORMAT),
  ];
}

function semanticTableName(useCase, index) {
  return `ML ${String(index + 1).padStart(2, '0')} ${useCase.displayName}`;
}

function semanticModelDefinition(config, metadata) {
  const fabric = config.tokenomicsPlatform.fabric;
  const outputSchema = fabric.outputSchema;
  const commonTables = [
    modelTable({
      name: 'Usage',
      schema: outputSchema,
      sourceTable: fabric.reportingTables.usageFact,
      columns: usageColumns,
      measures: usageMeasures(),
      sqlEndpointHost: metadata.sqlEndpointConnectionString,
      databaseName: fabric.lakehouseName,
    }),
    modelTable({
      name: 'ML Insights',
      schema: outputSchema,
      sourceTable: fabric.reportingTables.insightFact,
      columns: insightColumns,
      measures: insightMeasures('ML Insights'),
      sqlEndpointHost: metadata.sqlEndpointConnectionString,
      databaseName: fabric.lakehouseName,
    }),
    modelTable({
      name: 'Price History',
      schema: outputSchema,
      sourceTable: fabric.reportingTables.priceHistory,
      columns: priceColumns,
      measures: [
        measure('Market Input Rate', "AVERAGE('Price History'[market_input_usd_per_million])", CURRENCY_FORMAT),
        measure('Market Output Rate', "AVERAGE('Price History'[market_output_usd_per_million])", CURRENCY_FORMAT),
        measure('Negotiated Input Rate', "AVERAGE('Price History'[negotiated_input_usd_per_million])", CURRENCY_FORMAT),
        measure('Negotiated Output Rate', "AVERAGE('Price History'[negotiated_output_usd_per_million])", CURRENCY_FORMAT),
      ],
      sqlEndpointHost: metadata.sqlEndpointConnectionString,
      databaseName: fabric.lakehouseName,
    }),
    modelTable({
      name: 'Model Runs',
      schema: outputSchema,
      sourceTable: fabric.reportingTables.runLedger,
      columns: runColumns,
      measures: [
        measure('Run Count', "COUNTROWS('Model Runs')", INTEGER_FORMAT),
        measure('Successful Runs', "CALCULATE(COUNTROWS('Model Runs'), 'Model Runs'[status] = \"Succeeded\")", INTEGER_FORMAT),
        measure('Failed Runs', "CALCULATE(COUNTROWS('Model Runs'), 'Model Runs'[status] = \"Failed\")", INTEGER_FORMAT),
        measure('Rows Scored', "SUM('Model Runs'[row_count])", INTEGER_FORMAT),
      ],
      sqlEndpointHost: metadata.sqlEndpointConnectionString,
      databaseName: fabric.lakehouseName,
    }),
  ];
  const mlTables = fabric.mlUseCases.map((useCase, index) => {
    const name = semanticTableName(useCase, index);
    const shortName = `ML ${String(index + 1).padStart(2, '0')}`;
    return modelTable({
      name,
      schema: outputSchema,
      sourceTable: useCase.outputTableName,
      columns: insightColumns,
      measures: insightMeasures(name, shortName),
      sqlEndpointHost: metadata.sqlEndpointConnectionString,
      databaseName: fabric.lakehouseName,
    });
  });
  const model = {
    compatibilityLevel: 1702,
    model: {
      culture: 'en-US',
      sourceQueryCulture: 'en-US',
      defaultPowerBIDataSourceVersion: 'powerBI_V3',
      discourageImplicitMeasures: true,
      dataAccessOptions: {
        legacyRedirects: true,
        returnErrorValuesAsNull: true,
      },
      tables: [...commonTables, ...mlTables],
    },
  };
  const definitionProperties = {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
    version: '5.0',
    settings: { qnaEnabled: false },
  };

  return {
    format: 'TMSL',
    parts: [
      inlinePart('model.bim', JSON.stringify(model, null, 2)),
      inlinePart('definition.pbism', JSON.stringify(definitionProperties, null, 2)),
    ],
  };
}

function columnSelect(entity, property) {
  return {
    Column: {
      Expression: { SourceRef: { Source: 's' } },
      Property: property,
    },
    Name: `${entity}.${property}`,
  };
}

function measureSelect(entity, property) {
  return {
    Measure: {
      Expression: { SourceRef: { Source: 's' } },
      Property: property,
    },
    Name: `${entity}.${property}`,
  };
}

function projection(entity, property, active = false) {
  return {
    queryRef: `${entity}.${property}`,
    ...(active ? { active: true } : {}),
  };
}

function visualContainer({ reportName, pageName, visualType, title, x, y, width, height, z, entity, projections, select }) {
  const name = hash(`${reportName}|${pageName}|${title}|${z}`).slice(0, 20);
  const position = { x, y, z, width, height, tabOrder: z };
  const visual = {
    visualType,
    projections,
    prototypeQuery: {
      Version: 2,
      From: [{ Name: 's', Entity: entity, Type: 0 }],
      Select: select,
    },
    drillFilterOtherVisuals: true,
    vcObjects: {
      title: [{
        properties: {
          show: { expr: { Literal: { Value: 'true' } } },
          text: { expr: { Literal: { Value: `'${title.replaceAll("'", "''")}'` } } },
        },
      }],
    },
  };

  return {
    config: JSON.stringify({ name, layouts: [{ id: 0, position }], singleVisual: visual }),
    filters: '[]',
    height,
    width,
    x,
    y,
    z,
  };
}

function card(context, entity, measureName, title, x, y, z, width = 196) {
  return visualContainer({
    ...context,
    visualType: 'card', title, x, y, width, height: 88, z, entity,
    projections: { Values: [projection(entity, measureName)] },
    select: [measureSelect(entity, measureName)],
  });
}

function chart(context, { visualType, entity, category, measures, series, title, x, y, width, height, z }) {
  const projections = {
    Category: [projection(entity, category, true)],
    Y: measures.map(name => projection(entity, name)),
  };
  if (series) projections.Series = [projection(entity, series)];
  return visualContainer({
    ...context,
    visualType, title, x, y, width, height, z, entity, projections,
    select: [columnSelect(entity, category), ...measures.map(name => measureSelect(entity, name)), ...(series ? [columnSelect(entity, series)] : [])],
  });
}

function tableVisual(context, { entity, columns = [], measures = [], title, x, y, width, height, z }) {
  const properties = [...columns, ...measures];
  return visualContainer({
    ...context,
    visualType: 'tableEx', title, x, y, width, height, z, entity,
    projections: { Values: properties.map(name => projection(entity, name)) },
    select: [...columns.map(name => columnSelect(entity, name)), ...measures.map(name => measureSelect(entity, name))],
  });
}

function matrixVisual(context, { entity, rows, measures, title, x, y, width, height, z }) {
  return visualContainer({
    ...context,
    visualType: 'pivotTable', title, x, y, width, height, z, entity,
    projections: {
      Rows: rows.map((name, index) => projection(entity, name, index === 0)),
      Values: measures.map(name => projection(entity, name)),
    },
    select: [...rows.map(name => columnSelect(entity, name)), ...measures.map(name => measureSelect(entity, name))],
  });
}

function slicer(context, entity, property, title, x, y, z, width = 152) {
  return visualContainer({
    ...context,
    visualType: 'slicer', title, x, y, width, height: 76, z, entity,
    projections: { Values: [projection(entity, property, true)] },
    select: [columnSelect(entity, property)],
  });
}

function reportPage(displayName, visuals) {
  return {
    config: '{}',
    displayName,
    displayOption: 1,
    filters: '[]',
    height: 720,
    name: `ReportSection${hash(displayName).slice(0, 18)}`,
    visualContainers: visuals,
    width: 1280,
  };
}

function reportDefinition({ reportName, description, pages, semanticModelId }) {
  const reportConfig = {
    version: '5.70',
    themeCollection: {},
    activeSectionIndex: 0,
    defaultDrillFilterOtherVisuals: true,
    linguisticSchemaSyncVersion: 0,
    settings: {
      useNewFilterPaneExperience: true,
      allowChangeFilterTypes: true,
      useStylableVisualContainerHeader: true,
      queryLimitOption: 6,
      useEnhancedTooltips: true,
      exportDataMode: 1,
      useDefaultAggregateDisplayName: true,
    },
  };
  const legacyReport = {
    config: JSON.stringify(reportConfig),
    filters: '[]',
    layoutOptimization: 0,
    resourcePackages: [],
    sections: pages,
  };
  const definitionProperties = {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
    version: '4.0',
    datasetReference: {
      byConnection: { connectionString: `semanticmodelid=${semanticModelId}` },
    },
  };

  return {
    format: 'PBIR-Legacy',
    parts: [
      inlinePart('definition.pbir', JSON.stringify(definitionProperties, null, 2)),
      inlinePart('report.json', JSON.stringify(legacyReport, null, 2)),
    ],
  };
}

function consumptionReport(config, semanticModelId) {
  const reportName = config.tokenomicsPlatform.fabric.reportName;
  const pageContext = pageName => ({ reportName, pageName });
  const executive = 'Executive Overview';
  const executiveContext = pageContext(executive);
  const executiveVisuals = [
    card(executiveContext, 'Usage', 'Total Tokens', 'Total Tokens', 16, 16, 1000),
    card(executiveContext, 'Usage', 'Market Cost', 'Market Cost', 224, 16, 2000),
    card(executiveContext, 'Usage', 'Negotiated Cost', 'Negotiated Cost', 432, 16, 3000),
    card(executiveContext, 'Usage', 'Potential Savings', 'Potential Savings', 640, 16, 4000),
    card(executiveContext, 'Usage', 'Active Users', 'Active Users', 848, 16, 5000),
    card(executiveContext, 'Usage', 'Active Projects', 'Active Projects', 1056, 16, 6000),
    chart(executiveContext, { visualType: 'lineChart', entity: 'Usage', category: 'usage_date', measures: ['Market Cost', 'Negotiated Cost', 'Reported Cost'], title: 'Cost Across Date', x: 16, y: 120, width: 816, height: 280, z: 7000 }),
    chart(executiveContext, { visualType: 'pieChart', entity: 'Usage', category: 'source_code', measures: ['Market Cost'], title: 'Cost by Model Provider', x: 848, y: 120, width: 416, height: 280, z: 8000 }),
    chart(executiveContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'team_id', measures: ['Market Cost'], title: 'Cost by Team', x: 16, y: 416, width: 608, height: 288, z: 9000 }),
    chart(executiveContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'project_id', measures: ['Total Tokens'], title: 'Tokens by Project', x: 640, y: 416, width: 624, height: 288, z: 10000 }),
  ];

  const explorer = 'Usage and Cost Explorer';
  const explorerContext = pageContext(explorer);
  const slicerTitles = {
    event_ts: 'Event Time', usage_date: 'Date', team_id: 'Team', user_id_hash: 'User', project_id: 'Project',
    department_id: 'Department', business_unit_id: 'Business Unit', cost_center_id: 'Cost Center', application_id: 'Application',
    environment: 'Environment', source_code: 'Provider', model_family: 'Model Family', model_name: 'Model',
    model_version: 'Version', task_type: 'Task Type',
  };
  const reportDimensions = config.tokenomicsPlatform.fabric.reportDimensions;
  const slicerFields = reportDimensions.map(property => [property, slicerTitles[property] ?? property]);
  const explorerVisuals = slicerFields.map(([property, title], index) =>
    slicer(explorerContext, 'Usage', property, title, 16 + (index % 8) * 156, 16 + Math.floor(index / 8) * 80, 1000 + index * 100),
  );
  explorerVisuals.push(
    chart(explorerContext, { visualType: 'lineChart', entity: 'Usage', category: 'event_ts', measures: ['Total Tokens', 'Market Cost'], title: 'Token Consumption and Dollars Across Time', x: 16, y: 184, width: 1248, height: 220, z: 3000 }),
    tableVisual(explorerContext, { entity: 'Usage', columns: reportDimensions, measures: ['Total Requests', 'Total Tokens', 'Reported Cost', 'Market Cost', 'Negotiated Cost'], title: 'Governed Consumption and Cost Detail', x: 16, y: 420, width: 1248, height: 284, z: 4000 }),
  );

  const chargeback = 'Chargeback and Allocation';
  const chargebackContext = pageContext(chargeback);
  const chargebackVisuals = [
    card(chargebackContext, 'Usage', 'Market Cost', 'Market Cost', 16, 16, 1000),
    card(chargebackContext, 'Usage', 'Negotiated Cost', 'Negotiated Cost', 224, 16, 2000),
    card(chargebackContext, 'Usage', 'Reported Cost', 'Reported Cost', 432, 16, 3000),
    card(chargebackContext, 'Usage', 'Cost per 1K Tokens', 'Cost per 1K Tokens', 640, 16, 4000),
    chart(chargebackContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'team_id', measures: ['Reported Cost', 'Market Cost'], title: 'Dollars by Team', x: 16, y: 120, width: 608, height: 272, z: 5000 }),
    chart(chargebackContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'project_id', measures: ['Reported Cost', 'Market Cost'], title: 'Dollars by Project', x: 640, y: 120, width: 624, height: 272, z: 6000 }),
    tableVisual(chargebackContext, { entity: 'Usage', columns: ['usage_date', 'business_unit_id', 'department_id', 'cost_center_id', 'team_id', 'user_id_hash', 'project_id', 'application_id', 'environment'], measures: ['Total Tokens', 'Reported Cost', 'Market Cost', 'Negotiated Cost'], title: 'Allocation Detail', x: 16, y: 408, width: 1248, height: 296, z: 7000 }),
  ];

  const economics = 'Model Economics';
  const economicsContext = pageContext(economics);
  const economicsVisuals = [
    chart(economicsContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'source_code', measures: ['Reported Cost', 'Market Cost', 'Negotiated Cost'], title: 'Dollars by Provider', x: 16, y: 16, width: 608, height: 256, z: 1000 }),
    chart(economicsContext, { visualType: 'clusteredBarChart', entity: 'Usage', category: 'model_family', measures: ['Market Cost'], title: 'Dollars by Model Family', x: 640, y: 16, width: 624, height: 256, z: 2000 }),
    chart(economicsContext, { visualType: 'clusteredColumnChart', entity: 'Usage', category: 'model_name', series: 'model_version', measures: ['Total Tokens'], title: 'Tokens by Model and Version', x: 16, y: 288, width: 608, height: 240, z: 3000 }),
    chart(economicsContext, { visualType: 'lineChart', entity: 'Price History', category: 'effective_from', measures: ['Market Input Rate', 'Market Output Rate', 'Negotiated Input Rate', 'Negotiated Output Rate'], title: 'Effective-Dated Price History', x: 640, y: 288, width: 624, height: 240, z: 4000 }),
    tableVisual(economicsContext, { entity: 'Price History', columns: ['source_code', 'model_family', 'model_name', 'model_version', 'effective_from', 'effective_to', 'is_current', 'source_name'], measures: ['Market Input Rate', 'Market Output Rate', 'Negotiated Input Rate', 'Negotiated Output Rate'], title: 'Auditable Model Rates', x: 16, y: 544, width: 1248, height: 160, z: 5000 }),
  ];

  const userDrilldown = 'Consumption by User';
  const userDrilldownContext = pageContext(userDrilldown);
  const userDrilldownVisuals = [
    card(userDrilldownContext, 'Usage', 'Total Tokens', 'Total Tokens', 16, 16, 1000),
    card(userDrilldownContext, 'Usage', 'Market Cost', 'Market Cost', 224, 16, 2000),
    card(userDrilldownContext, 'Usage', 'Reported Cost', 'Reported Cost', 432, 16, 3000),
    slicer(userDrilldownContext, 'Usage', 'usage_date', 'Date', 656, 16, 4000, 192),
    slicer(userDrilldownContext, 'Usage', 'team_id', 'Team', 864, 16, 4100, 192),
    slicer(userDrilldownContext, 'Usage', 'project_id', 'Project', 1072, 16, 4200, 192),
    matrixVisual(userDrilldownContext, {
      entity: 'Usage',
      rows: ['user_id_hash', 'model_family', 'source_code', 'model_name', 'model_version'],
      measures: ['Total Tokens', 'Reported Cost', 'Market Cost', 'Negotiated Cost'],
      title: 'User > Model Family > Provider > Model > Version',
      x: 16, y: 120, width: 1248, height: 584, z: 5000,
    }),
  ];

  const providerDrilldown = 'Consumption by Provider';
  const providerDrilldownContext = pageContext(providerDrilldown);
  const providerDrilldownVisuals = [
    card(providerDrilldownContext, 'Usage', 'Total Tokens', 'Total Tokens', 16, 16, 1000),
    card(providerDrilldownContext, 'Usage', 'Market Cost', 'Market Cost', 224, 16, 2000),
    card(providerDrilldownContext, 'Usage', 'Reported Cost', 'Reported Cost', 432, 16, 3000),
    slicer(providerDrilldownContext, 'Usage', 'usage_date', 'Date', 656, 16, 4000, 192),
    slicer(providerDrilldownContext, 'Usage', 'team_id', 'Team', 864, 16, 4100, 192),
    slicer(providerDrilldownContext, 'Usage', 'project_id', 'Project', 1072, 16, 4200, 192),
    matrixVisual(providerDrilldownContext, {
      entity: 'Usage',
      rows: ['source_code', 'model_family', 'model_name', 'model_version', 'user_id_hash'],
      measures: ['Total Tokens', 'Reported Cost', 'Market Cost', 'Negotiated Cost'],
      title: 'Provider > Model Family > Model > Version > User',
      x: 16, y: 120, width: 1248, height: 584, z: 5000,
    }),
  ];

  return reportDefinition({
    reportName,
    description: 'Token consumption, cost, chargeback, and model economics across governed business and model dimensions.',
    semanticModelId,
    pages: [
      reportPage(executive, executiveVisuals),
      reportPage(userDrilldown, userDrilldownVisuals),
      reportPage(providerDrilldown, providerDrilldownVisuals),
      reportPage(explorer, explorerVisuals),
      reportPage(chargeback, chargebackVisuals),
      reportPage(economics, economicsVisuals),
    ],
  });
}

function mlOutputPage(reportName, useCase, index) {
  const pageName = `${String(index + 1).padStart(2, '0')} ${useCase.displayName}`;
  const context = { reportName, pageName };
  const entity = semanticTableName(useCase, index);
  const pfx = `ML ${String(index + 1).padStart(2, '0')}`;
  const visuals = [
    slicer(context, entity, 'event_date', 'Date', 16, 16, 1000, 180),
    slicer(context, entity, 'team_id', 'Team', 208, 16, 1100, 180),
    slicer(context, entity, 'project_id', 'Project', 400, 16, 1200, 180),
    slicer(context, entity, 'source_code', 'Provider', 592, 16, 1300, 180),
    slicer(context, entity, 'model_family', 'Model Family', 784, 16, 1400, 220),
    slicer(context, entity, 'model_version', 'Version', 1016, 16, 1500, 248),
    card(context, entity, `${pfx} Output Rows`, 'Output Rows', 16, 108, 2000),
    card(context, entity, `${pfx} Average Metric`, 'Average Metric', 224, 108, 2100),
    card(context, entity, `${pfx} Average Risk Score`, 'Risk Score', 432, 108, 2200),
    card(context, entity, `${pfx} Average Probability`, 'Probability', 640, 108, 2300),
    card(context, entity, `${pfx} Predicted Cost`, 'Predicted Cost', 848, 108, 2400),
    card(context, entity, `${pfx} Estimated Savings`, 'Estimated Savings', 1056, 108, 2500),
    chart(context, { visualType: 'lineChart', entity, category: 'event_date', measures: [`${pfx} Average Metric`, `${pfx} Average Risk Score`], title: `${useCase.displayName} Across Date`, x: 16, y: 212, width: 608, height: 224, z: 3000 }),
    chart(context, { visualType: 'clusteredBarChart', entity, category: 'team_id', measures: [`${pfx} Average Metric`, `${pfx} Estimated Savings`], title: `${useCase.displayName} by Team`, x: 640, y: 212, width: 624, height: 224, z: 4000 }),
    tableVisual(context, { entity, columns: ['entity_type', 'entity_id', 'team_id', 'user_id_hash', 'project_id', 'source_code', 'model_family', 'model_name', 'model_version', 'metric_name', 'metric_value', 'risk_score', 'probability', 'recommendation', 'scoring_model_version'], measures: [], title: `${useCase.displayName} Detail and Recommendations`, x: 16, y: 452, width: 1248, height: 252, z: 5000 }),
  ];
  return reportPage(pageName, visuals);
}

function mlReport(config, semanticModelId) {
  const fabric = config.tokenomicsPlatform.fabric;
  const reportName = fabric.mlReportName;
  const overview = 'ML Portfolio Overview';
  const context = { reportName, pageName: overview };
  const overviewVisuals = [
    card(context, 'ML Insights', 'Output Rows', 'ML Output Rows', 16, 16, 1000),
    card(context, 'ML Insights', 'Average Risk Score', 'Average Risk Score', 224, 16, 2000),
    card(context, 'ML Insights', 'Average Probability', 'Average Probability', 432, 16, 3000),
    card(context, 'ML Insights', 'Predicted Cost', 'Predicted Cost', 640, 16, 4000),
    card(context, 'ML Insights', 'Estimated Savings', 'Estimated Savings', 848, 16, 5000),
    chart(context, { visualType: 'clusteredBarChart', entity: 'ML Insights', category: 'use_case_name', measures: ['Output Rows', 'Estimated Savings'], title: 'Outputs and Savings by ML Use Case', x: 16, y: 120, width: 608, height: 272, z: 6000 }),
    chart(context, { visualType: 'lineChart', entity: 'ML Insights', category: 'event_date', measures: ['Average Metric', 'Average Risk Score'], title: 'ML Signals Across Date', x: 640, y: 120, width: 624, height: 272, z: 7000 }),
    tableVisual(context, { entity: 'ML Insights', columns: ['event_date', 'use_case_name', 'entity_type', 'entity_id', 'team_id', 'project_id', 'source_code', 'model_family', 'model_name', 'model_version', 'metric_name', 'metric_value', 'recommendation'], measures: ['Predicted Cost', 'Estimated Savings'], title: 'Cross-Algorithm Insight Detail', x: 16, y: 408, width: 1248, height: 296, z: 8000 }),
  ];

  const governance = 'Model Governance';
  const governanceContext = { reportName, pageName: governance };
  const governanceVisuals = [
    card(governanceContext, 'Model Runs', 'Run Count', 'Run Count', 16, 16, 1000),
    card(governanceContext, 'Model Runs', 'Successful Runs', 'Successful Runs', 224, 16, 2000),
    card(governanceContext, 'Model Runs', 'Failed Runs', 'Failed Runs', 432, 16, 3000),
    card(governanceContext, 'Model Runs', 'Rows Scored', 'Rows Scored', 640, 16, 4000),
    chart(governanceContext, { visualType: 'clusteredBarChart', entity: 'Model Runs', category: 'use_case_key', measures: ['Run Count', 'Successful Runs', 'Failed Runs'], title: 'Run Status by Use Case', x: 16, y: 120, width: 608, height: 272, z: 5000 }),
    chart(governanceContext, { visualType: 'lineChart', entity: 'Model Runs', category: 'started_at', measures: ['Rows Scored'], title: 'Rows Scored Across Time', x: 640, y: 120, width: 624, height: 272, z: 6000 }),
    tableVisual(governanceContext, { entity: 'Model Runs', columns: ['run_id', 'use_case_key', 'notebook_name', 'run_type', 'status', 'started_at', 'completed_at', 'row_count', 'model_version', 'source_watermark', 'output_table'], title: 'Model Run Ledger', x: 16, y: 408, width: 1248, height: 296, z: 7000 }),
  ];

  return reportDefinition({
    reportName,
    description: 'Portfolio and detailed outputs for all 12 governed Tokenomics ML use cases.',
    semanticModelId,
    pages: [
      reportPage(overview, overviewVisuals),
      ...fabric.mlUseCases.map((useCase, index) => mlOutputPage(reportName, useCase, index)),
      reportPage(governance, governanceVisuals),
    ],
  });
}

function validateInputs(config, metadata, semanticModelId) {
  const fabric = config.tokenomicsPlatform?.fabric;
  if (!fabric || !Array.isArray(fabric.mlUseCases) || fabric.mlUseCases.length !== 12) {
    throw new Error('Tokenomics Power BI generation requires exactly 12 ML use cases.');
  }
  const requiredNames = ['semanticModelName', 'reportName', 'mlReportName', 'dashboardName', 'mlDashboardName', 'lakehouseName', 'outputSchema'];
  for (const name of requiredNames) {
    if (!fabric[name] || typeof fabric[name] !== 'string') throw new Error(`tokenomicsPlatform.fabric.${name} is required.`);
  }
  for (const useCase of fabric.mlUseCases) {
    if (!useCase.outputTableName || !/^[a-z][a-z0-9_]{0,127}$/.test(useCase.outputTableName)) {
      throw new Error(`ML use case '${useCase.key}' has an invalid outputTableName.`);
    }
  }
  if (!metadata.sqlEndpointConnectionString || !/^[a-z0-9-]+\.datawarehouse\.fabric\.microsoft\.com$/i.test(metadata.sqlEndpointConnectionString)) {
    throw new Error('Fabric metadata must contain a valid SQL endpoint connection string.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(semanticModelId)) {
    throw new Error('semanticModelId must be a GUID.');
  }
}

export function generatePowerBiArtifacts(config, metadata, semanticModelId = PLACEHOLDER_SEMANTIC_MODEL_ID) {
  validateInputs(config, metadata, semanticModelId);
  const fabric = config.tokenomicsPlatform.fabric;
  const semanticModel = semanticModelDefinition(config, metadata);
  const consumption = consumptionReport(config, semanticModelId);
  const ml = mlReport(config, semanticModelId);
  const requiredTables = [
    ...Object.values(fabric.reportingTables).map(name => `${fabric.outputSchema}.${name}`),
    ...fabric.mlUseCases.map(useCase => `${fabric.outputSchema}.${useCase.outputTableName}`),
  ];
  const tableContracts = [
    { qualifiedName: `${fabric.outputSchema}.${fabric.reportingTables.usageFact}`, semanticTable: 'Usage', columns: usageColumns.map(([name]) => name) },
    { qualifiedName: `${fabric.outputSchema}.${fabric.reportingTables.insightFact}`, semanticTable: 'ML Insights', columns: insightColumns.map(([name]) => name) },
    { qualifiedName: `${fabric.outputSchema}.${fabric.reportingTables.priceHistory}`, semanticTable: 'Price History', columns: priceColumns.map(([name]) => name) },
    { qualifiedName: `${fabric.outputSchema}.${fabric.reportingTables.runLedger}`, semanticTable: 'Model Runs', columns: runColumns.map(([name]) => name) },
    ...fabric.mlUseCases.map((useCase, index) => ({
      qualifiedName: `${fabric.outputSchema}.${useCase.outputTableName}`,
      semanticTable: semanticTableName(useCase, index),
      columns: insightColumns.map(([name]) => name),
    })),
  ];
  const manifest = {
    schemaVersion: 1,
    workspaceId: metadata.workspaceId ?? null,
    lakehouseId: metadata.lakehouseId ?? null,
    sqlEndpointId: metadata.sqlEndpointId ?? null,
    semanticModel: {
      name: fabric.semanticModelName,
      semanticModelId,
      tableCount: 4 + fabric.mlUseCases.length,
    },
    reports: [
      { name: fabric.reportName, pageNames: ['Executive Overview', 'Consumption by User', 'Consumption by Provider', 'Usage and Cost Explorer', 'Chargeback and Allocation', 'Model Economics'] },
      { name: fabric.mlReportName, pageNames: ['ML Portfolio Overview', ...fabric.mlUseCases.map((useCase, index) => `${String(index + 1).padStart(2, '0')} ${useCase.displayName}`), 'Model Governance'] },
    ],
    dashboards: [
      { name: fabric.dashboardName, sourceReport: fabric.reportName, sourcePage: 'Executive Overview' },
      { name: fabric.mlDashboardName, sourceReport: fabric.mlReportName, sourcePage: 'ML Portfolio Overview' },
    ],
    requiredTables,
    tableContracts,
    reportDimensions: [...fabric.reportDimensions],
    mlUseCases: fabric.mlUseCases.map((useCase, index) => ({
      key: useCase.key,
      displayName: useCase.displayName,
      outputTable: `${fabric.outputSchema}.${useCase.outputTableName}`,
      semanticTable: semanticTableName(useCase, index),
      reportPage: `${String(index + 1).padStart(2, '0')} ${useCase.displayName}`,
    })),
  };

  return { semanticModel, consumptionReport: consumption, mlReport: ml, manifest };
}

export async function writePowerBiArtifacts(artifacts, outputDirectory) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const files = {
    'semantic-model.definition.json': artifacts.semanticModel,
    'consumption-report.definition.json': artifacts.consumptionReport,
    'ml-report.definition.json': artifacts.mlReport,
    'manifest.json': artifacts.manifest,
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..', '..');
  const argument = name => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
  };
  const configPath = resolve(argument('--config') ?? join(repositoryRoot, 'config', 'deployment.json'));
  const metadataPath = resolve(argument('--fabric-metadata') ?? join(repositoryRoot, '.generated', 'tokenomics', 'fabric.json'));
  const outputDirectory = resolve(argument('--output') ?? join(repositoryRoot, '.generated', 'tokenomics', 'powerbi'));
  const semanticModelId = argument('--semantic-model-id') ?? PLACEHOLDER_SEMANTIC_MODEL_ID;
  const [config, metadata] = await Promise.all([
    readFile(configPath, 'utf8').then(JSON.parse),
    readFile(metadataPath, 'utf8').then(JSON.parse),
  ]);
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  await writePowerBiArtifacts(artifacts, outputDirectory);
  process.stdout.write(`${JSON.stringify({ outputDirectory, ...artifacts.manifest })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}