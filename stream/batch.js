const _ = require('lodash')
const parallel = require('through2-parallel')
const fields = require('./csv_fields')
const client = require('../src/client')

// Perform geocoding requests, map response JSON to CSV
const streamFactory = (options) => {
  const http = client()
  const streamOptions = _.pick(options, 'concurrency')

  return parallel.obj(streamOptions, (row, enc, next) => {
    // ensure every row contains all columns (even if they are empty)
    _.assign(row, _.zipObject(_.keys(fields)))

    // the http request options (params, headers, etc)
    const req = { params: {} }

    // call each template function to populate request object
    _.each(options.templates, (fn) => fn(req, row))

    // skip rows which produces no query params
    // https://github.com/axios/axios#request-config
    if (_.isEmpty(req.params)) {
      console.error('skipping request, no parameters')
      return next(null, row)
    }

    // verbose logging
    if (options.verbose) { console.error(options.endpoint, req) }

    // send http request
    http
      .get(options.endpoint, req)
      .then(res => {
        // use the first feature returned
        const feature = _.get(res, 'data.features[0]')
        if (feature) {
          // copy target fields to CSV row
          _.each(fields, (jpath, column) => row[column] = _.get(feature, jpath))
        }

        // add a delay to avoid '429 Too Many Requests' rate-limit errors
        _.delay(next, 1000, null, row)
      })
      .catch(error => {
        // display the HTTP response where available
        if (_.has(error, 'response.data')) {
          console.error(error.response.data)
          process.exit(1)
        }
        // else the verbose error
        next(error)
      })
  })
}

module.exports.geocoder = streamFactory
