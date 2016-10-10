/**
 * ChartData - data model to transform SODA output to chart ready format
 */

import _ from 'lodash';

/** Helper functions **/

// get max value by key from an array of objects
function getMaxValueByKey(array, key) {
  return _.chain(array)                 // start chain
    .groupBy(key)                       // group by key
    .keys()                             // so we can grab all key values
    .map((str) => +str)                 // conver to number
    .filter((value) => !isNaN(value))   // filter out invalid values
    .max()                              // get max value
    .value();                           // end chain and return value
}

// find data from latest year
function getDataForYear(array, year) {
  const dataForYear = _.find(array, { year: _.toString(year) });
  const value = _.round(dataForYear.data_value || null, 1);

  // return null if value is invalid
  return isNaN(value) ? null : value;
}

/** main class **/
export default class ChartData {

  constructor(data = [], dataSeries = 'breakout') {
    this.data = data;
    this.dataSeries = dataSeries;
  }

  chartConfig() {
    // if there is no data, return an empty object
    if (this.data.length === 0) {
      return {};
    }

    switch (this.dataSeries) {
      case 'latest':
        return this._getConfigByBreakout();
      case 'trend':
        return this._getConfigByYear();
      case 'pie':
        return this._getConfigForPieChart();
      default:
        // do nothing
    }

    return {};
  }

  getLatestYear() {
    return getMaxValueByKey(this.data, 'year');
  }

  _getConfigByYear() {
    // group data
    const groupedData = _.chain(this.data)
      .groupBy((row) =>
        `${row.locationdesc} - ${row.break_out}`
      )
      .reduce((acc, array, key) => {
        return Object.assign({}, acc, {
          [key]: _.keyBy(array, 'year')
        });
      }, {})
      .value();

    // generate x axis values
    const years = _.chain(this.data)
      .groupBy('year')
      .keys()
      .sortBy()
      .value();

    // generate data array based on categories (order is important)
    const columns = [['year'].concat(years)].concat(
      _.map(groupedData, (values, key) => {
        return [key].concat(years.map((year) => {
          if (!values[year] || !values[year].data_value) {
            return null;
          }
          return _.round(+values[year].data_value, 1);
        }));
      })
    );

    return {
      data: {
        columns,
        x: 'year',
        xFormat: '%Y'
      },
      axis: {
        x: {
          type: 'timeseries',
          tick: {
            format: '%Y'
          }
        },
        y: {
          label: {
            text: this.data[0].data_value_type || '',
            position: 'outer-middle'
          }
        }
      },
      tooltip: {
        format: {
          value: (value, ratio, id, index) => {
            let lc = 'N/A';
            let hc = 'N/A';

            if (groupedData[id] && years[index] && groupedData[id][years[index]]) {
              lc = _.round(+groupedData[id][years[index]].low_confidence_limit, 1);
              hc = _.round(+groupedData[id][years[index]].high_confidence_limit, 1);
            }

            return `${_.round(value, 1)} (${lc} - ${hc})`;
          }
        }
      }
    };
  }

  // generate C3 configuration object, when major axis is breakout categories
  _getConfigByBreakout() {
    // get latest year from data received
    const latestYear = getMaxValueByKey(this.data, 'year');

    // group data by state (main data series),
    // then by breakout, and get values from the latest year
    const groupedData = _.chain(this.data)
      .groupBy('locationdesc')
      .reduce((groupByLocation, valuesByLocation, location) => {
        return Object.assign({}, groupByLocation, {
          [location]: _.chain(valuesByLocation)
            .groupBy('break_out')
            .reduce((groupByBreakout, valuesByBreakout, breakout) => {
              return Object.assign({}, groupByBreakout, {
                [breakout]: getDataForYear(valuesByBreakout, latestYear)
              });
            }, {})
            .value()
        });
      }, {})
      .value();

    // generate x axis values
    const categories = _.chain(this.data)
      .groupBy('break_out')
      .keys()
      .sortBy()
      .value();

    // generate data array based on categories (order is important)
    const columns = _.map(groupedData, (value, key) =>
      [key].concat(categories.map((breakout) =>
        value[breakout] || null
      ))
    );

    return {
      data: {
        columns
      },
      axis: {
        x: {
          categories,
          type: 'category'
        },
        y: {
          label: {
            text: `${this.data[0].data_value_type || ''} (in year ${latestYear})`,
            position: 'outer-middle'
          }
        }
      }
    };
  }

  // get C3 config for a pie chart, where data array is a breakout category
  _getConfigForPieChart() {
    // get latest year from data received
    const latestYear = getMaxValueByKey(this.data, 'year');

    // group data by state (data series) to see if we are displaying state or national data
    const groupedByLocation = _.groupBy(this.data, 'locationabbr');

    // use National data by default
    let groupedData = groupedByLocation.US;

    // .. but if there are two locations, use state's
    if (_.size(groupedByLocation) === 2) {
      const state = _.without(Object.keys(groupedByLocation), 'US').shift();
      groupedData = groupedByLocation[state];
    }

    const transformedData = _.chain(groupedData)
      .groupBy('breakoutid')
      .reduce((groupedByBreakout, valuesByBreakout, breakout) => {
        return Object.assign({}, groupedByBreakout, {
          [breakout]: {
            value: getDataForYear(valuesByBreakout, latestYear),
            label: valuesByBreakout[0].break_out
          }
        });
      }, {})
      .value();

    // generate data array based on categories (order is important)
    const columns = _.chain(groupedData)
      .groupBy('breakoutid')
      .keys()
      .sortBy()
      .value()
      .map((breakout) => {
        return [transformedData[breakout].label].concat(transformedData[breakout].value);
      });

    return {
      data: {
        columns
      }
    };
  }

}
