/**
 * ChartData - data model to transform SODA output to chart ready format
 */

import _ from 'lodash';

export default class ChartData {

  constructor(data = [], majorAxis = 'breakout') {
    this.data = data;
    this.majorAxis = majorAxis;
  }

  chartConfig() {
    // if there is no data, return an empty object
    if (this.data.length === 0) {
      return {};
    }

    switch (this.majorAxis) {
      case 'breakout':
        return this._getConfigByBreakout();
      case 'year':
        return this._getConfigByYear();
      case 'pie':
        return this._getConfigForPieChart();
      default:
        // do nothing
    }

    return {};
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
          label: this.data[0].data_value_type || ''
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

  // get C3 config where major axis is breakout categories
  _getConfigByBreakout() {
    // group data by state (data series),
    // then by breakout, and sum results
    const groupedData = _.chain(this.data)
      .groupBy('locationdesc')
      .reduce((groupByLocation, valuesByLocation, location) => {
        return Object.assign({}, groupByLocation, {
          [location]: _.chain(valuesByLocation)
            .groupBy('break_out')
            .reduce((groupByBreakout, valuesByBreakout, breakout) => {
              return Object.assign({}, groupByBreakout, {
                [breakout]: _.chain(valuesByBreakout)
                  .map((row) => {
                    if (row.data_value && !isNaN(parseFloat(row.data_value))) {
                      return +row.data_value;
                    }
                    return null;
                  })
                  .filter((row) => row !== null)
                  .mean()
                  .round(1)
                  .value()
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
          label: this.data[0].data_value_type || ''
        }
      }
    };
  }

  // get C3 config for pie chart, where data array is a breakout category
  _getConfigForPieChart() {
    // group data by state (data series) to see if we are displaying state or national data
    const groupedByLocation = _.groupBy(this.data, 'locationabbr');

    // use National data by default
    let groupedData = groupedByLocation.US;

    // .. but if there are two locations, use state's
    if (groupedByLocation.length === 2) {
      const state = _.without(Object.keys(groupedByLocation), 'US').shift();
      groupedData = groupedByLocation[state];
    }

    const transformedData = _.chain(groupedData)
      .groupBy('break_out')
      .reduce((groupedByBreakout, valuesByBreakout, breakout) => {
        return Object.assign({}, groupedByBreakout, {
          [breakout]: _.chain(valuesByBreakout)
            .map((row) => {
              if (row.data_value && !isNaN(parseFloat(row.data_value))) {
                return +row.data_value;
              }
              return null;
            })
            .filter((row) => row !== null)
            .mean()
            .round(1)
            .value()
        });
      }, {})
      .value();

    // generate data array based on categories (order is important)
    const columns = _.chain(groupedData)
      .groupBy('break_out')
      .keys()
      .sortBy()
      .value()
      .map((breakout) => {
        return [breakout].concat(transformedData[breakout]);
      });

    return {
      data: {
        columns
      }
    };
  }

}
