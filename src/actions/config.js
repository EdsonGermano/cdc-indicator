import { FETCH_CONFIG,
         USER_CONFIGURABLE_OPTIONS,
         CONFIG } from '../constants';
import _ from 'lodash';
import Soda from '../lib/Soda';

function setConfigurations(responses) {
  const [appConfig,
         filterConfig,
         filters,
         yearConfig,
         chartConfig,
         dataSourceConfig] = responses;

  let config;

  // verify we received critical part of response
  if (_.isArray(appConfig)) {
    config = appConfig[0] || undefined;
  }

  // do not continue if we did not receive expected data
  if (config === undefined) {
    return {
      type: FETCH_CONFIG,
      config
    };
  }

  // re-label some keys since SODA always use _
  const newFilterConfig = filterConfig.map((row, i) => {
    const defaultValue = _.find(filters[i], { [row.value_column]: row.default_value });
    return Object.assign({}, row, {
      name: row.value_column,
      defaultValue: row.default_value,
      defaultLabel: defaultValue[row.label_column]
    });
  });

  // iterate over filter configuration to transform filter values
  // order of filterConfig and filters correspond to each other
  filters.forEach((filter, i) => {
    // if there is a group by specified, pub options into optionGroups array
    if (filterConfig[i].group_by) {
      const groupedData = _.groupBy(filter, filterConfig[i].group_by);
      newFilterConfig[i].optionGroups = _.map(groupedData, (data, key) => {
        return {
          text: key,
          options: data.map((row) => {
            return {
              text: row[filterConfig[i].label_column],
              value: row[filterConfig[i].value_column]
            };
          })
        };
      });
    } else {
      const options = filter.map((row) => {
        return {
          text: row[filterConfig[i].label_column],
          value: row[filterConfig[i].value_column]
        };
      });

      // pull default value and put it as first element
      const defaultValue = _.find(options, { value: newFilterConfig[i].defaultValue });

      newFilterConfig[i].options = options.filter((row) =>
        row.value !== newFilterConfig[i].defaultValue
      );
      newFilterConfig[i].options.unshift(defaultValue);
    }
  });

  // set latest year and year range to query data for
  const latestYear = yearConfig.map((row) => +row.year).sort().pop();
  const fromYear = latestYear - (+(config.data_points || 10)) + 1;

  // set data source object
  const dataSources = _.keyBy(dataSourceConfig, 'questionid');

  config = Object.assign(config, {
    filterConfig: newFilterConfig,
    chartConfig,
    latestYear,
    fromYear,
    dataSources
  });

  return {
    type: FETCH_CONFIG,
    config
  };
}

export function fetchAppConfigurations() {
  // application configurations
  const configPromise = (!CONFIG.data.useConfigurationDatasets) ?
    Promise.resolve(USER_CONFIGURABLE_OPTIONS.app) :
    new Soda({
      appToken: CONFIG.data.appToken,
      hostname: CONFIG.data.host,
      useSecure: true
    })
      .dataset(CONFIG.data.appConfigDatasetId)
      .limit(1)
      .fetchData();

  // filter configurations
  const filterConfigPromise = (!CONFIG.data.useConfigurationDatasets) ?
    Promise.resolve(USER_CONFIGURABLE_OPTIONS.filter) :
    new Soda({
      appToken: CONFIG.data.appToken,
      hostname: CONFIG.data.host,
      useSecure: true
    })
      .dataset(CONFIG.data.filterConfigDatasetId)
      .order('sort')
      .fetchData();

  // visualization configurations
  const chartConfigPromise = (!CONFIG.data.useConfigurationDatasets) ?
    Promise.resolve(USER_CONFIGURABLE_OPTIONS.chart) :
    new Soda({
      appToken: CONFIG.data.appToken,
      hostname: CONFIG.data.host,
      useSecure: true
    })
      .dataset(CONFIG.data.chartConfigDatasetId)
      .where('published=true')
      .order('sort')
      .fetchData();

  // indicator data sources configurations
  const dataSourcesPromise = (!CONFIG.data.useConfigurationDatasets) ?
    Promise.resolve(USER_CONFIGURABLE_OPTIONS.indicators) :
    new Soda({
      appToken: CONFIG.data.appToken,
      hostname: CONFIG.data.host,
      useSecure: true
    })
      .dataset(CONFIG.data.indicatorsConfigDatasetId)
      .fetchData();

  // actual filter values based on data
  const filterPromise = filterConfigPromise
    .then((response) => {
      // continue to make data requests to populate filter dropdown
      const promiseArray = response.map((row) => {
        const columnArray = [row.value_column, row.label_column];

        if (row.group_by) {
          columnArray.unshift(row.group_by);
        }

        return new Soda({
          appToken: CONFIG.data.appToken,
          hostname: CONFIG.data.host,
          useSecure: true
        })
          .dataset(CONFIG.data.datasetId)
          .select(columnArray)
          .where([{
            column: row.label_column,
            operator: 'IS NOT NULL'
          }, {
            column: row.value_column,
            operator: 'IS NOT NULL'
          }])
          .group(columnArray)
          .order(row.label_column)
          .fetchData();
      });

      return Promise.all(promiseArray);
    });

  // list of years
  const yearPromise = new Soda({
    appToken: CONFIG.data.appToken,
    hostname: CONFIG.data.host,
    useSecure: true
  })
    .dataset(CONFIG.data.datasetId)
    .where({
      column: 'year',
      operator: 'IS NOT NULL'
    })
    .select('year')
    .group('year')
    .fetchData();

  return (dispatch) => {
    Promise.all([
      configPromise,
      filterConfigPromise,
      filterPromise,
      yearPromise,
      chartConfigPromise,
      dataSourcesPromise
    ])
      .then((responses) => {
        dispatch(setConfigurations(responses));
      });
  };
}
