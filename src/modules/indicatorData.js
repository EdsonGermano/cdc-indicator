import _ from 'lodash';
import rowFormatter from 'lib/rowFormatter';
import Soda from 'lib/Soda';
import { CONFIG } from 'constants';

// --------------------------------------------------
// Constants
// --------------------------------------------------

export const SET_INDICATOR_DATA = 'SET_INDICATOR_DATA';
export const SET_INDICATOR_ERROR = 'SET_INDICATOR_ERROR';
export const SET_INDICATOR_LATEST_YEAR = 'SET_INDICATOR_LATEST_YEAR';
export const SET_INDICATOR_REQUEST_STATUS = 'SET_INDICATOR_REQUEST_STATUS';

// --------------------------------------------------
// Actions
// --------------------------------------------------

function setRawData(data = []) {
  return {
    type: SET_INDICATOR_DATA,
    data
  };
}

function setLatestYear(latestYear = -1) {
  return {
    type: SET_INDICATOR_LATEST_YEAR,
    latestYear
  };
}

function setError(error = true, errorMessage = 'Error') {
  return {
    type: SET_INDICATOR_ERROR,
    error,
    errorMessage
  };
}

function setRequestStatus(status) {
  return {
    type: SET_INDICATOR_REQUEST_STATUS,
    status
  };
}

function formatIndicatorData(response) {
  return (dispatch, getState) => {
    // typecast data in specific columns (since everything is string in the received JSON)
    const data = response.map(rowFormatter);

    // determine the latest year from available data
    const latestYear = _.chain(data)
      .map(row => row.year)
      .max()
      .value();

    // filter data within the desired data points
    const dataPoints = _.get(getState(), 'appConfig.config.core.data_points');
    const filteredData = data.filter(row => row.year > (latestYear - dataPoints));

    dispatch(setRawData(filteredData));
    dispatch(setLatestYear(latestYear));
    dispatch(setRequestStatus(false));
  };
}

function fetchIndicatorData() {
  return (dispatch, getState) => {
    const filters = _.get(getState(), 'filters.selected', {});
    const locationColumn = _.get(getState(), 'appConfig.config.core.location_id_column');

    // if a state other than "US" is selected, also get "US" data
    const filterCondition = Object.keys(filters).map(key => {
      if (key === locationColumn && filters[key].id !== 'US') {
        return {
          operator: 'OR',
          condition: [
            {
              column: key,
              operator: '=',
              value: filters[key].id
            },
            {
              column: key,
              operator: '=',
              value: 'US'
            }
          ]
        };
      }

      return {
        column: key,
        operator: '=',
        value: filters[key].id
      };
    });

    // always add following query conditions
    filterCondition.push({
      column: 'year',
      operator: 'IS NOT NULL'
    });

    new Soda(CONFIG.soda)
      .dataset(CONFIG.data.datasetId)
      .where(filterCondition)
      .order('year')
      .fetchData()
      .then((response) => {
        dispatch(formatIndicatorData(response));
      })
      .catch(() => {
        dispatch(setError(
          true,
          'There was a network error while retrieving data. Please try again.'
        ));
      });
  };
}

export function fetchData() {
  return (dispatch) => {
    dispatch(setRequestStatus(true));
    dispatch(fetchIndicatorData());
  };
}

// --------------------------------------------------
// Action Handlers
// --------------------------------------------------
const actionsMap = {
  [SET_INDICATOR_DATA]: (state, action) => (
    {
      ...state,
      data: action.data
    }
  ),
  [SET_INDICATOR_ERROR]: (state, action) => (
    {
      ...state,
      error: action.error,
      errorMessage: action.errorMessage,
      fetching: false
    }
  ),
  [SET_INDICATOR_LATEST_YEAR]: (state, action) => (
    { ...state, latestYear: action.latestYear }
  ),
  [SET_INDICATOR_REQUEST_STATUS]: (state, action) => (
    {
      ...state,
      error: false,
      fetching: action.status
    }
  )
};

// --------------------------------------------------
// Reducers
// --------------------------------------------------
const initialState = {
  data: [],
  error: false,
  errorMessage: '',
  fetching: true,
  latestYear: -1
};

export default function indicatorDataReducer(state = initialState, action) {
  const fn = actionsMap[action.type];
  if (!fn) {
    return state;
  }
  return fn(state, action);
}
