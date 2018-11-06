const path = require('path');
const _ = require('lodash');
const moment = require('moment');
const redis = require('redis');
const express = require('express');
const request = require('request-json');

const env = process.env;

const port = env.PORT;
const access_key = env.ACCESS_KEY;
const apiURL = env.API_URL;
const locationsURL = env.LOCATIONS_URL;
const locationFilter = new RegExp(env.LOCATION_FILTER);

const chartLocations= (env.CHART_LOCATIONS || '').split(',').filter(location => location.length > 0);
const chartPriceMin = parseFloat(env.CHART_PRICE_MIN);
const chartPriceMax = parseFloat(env.CHART_PRICE_MAX);
const chartDays = parseInt(env.CHART_DAYS);

const lastmodified = '1970-01-01';

console.log('ACCESS_KEY=', access_key);
console.log('LOCATIONS_URL=',locationsURL);
console.log('LOCATION_FILTER=', locationFilter);

console.log('CHART_LOCATIONS=', chartLocations);
console.log('CHART_PRICE_MIN=', chartPriceMin);
console.log('CHART_PRICE_MAX=', chartPriceMin);
console.log('CHART_DAYS=', chartPriceMax);

const httpClient = request.createClient(apiURL);

async function getLocations() {
  const response = await httpClient.post(locationsURL, {access_key, lastmodified});
  return response.body
    .filter(location => locationFilter.test(location.address));
}

async function getPrices() {
  if (!env.REDIS_URL) {
    return [];
  }
  const redisClient = redis.createClient(env.REDIS_URL);
  return new Promise((resove, reject) => {
    redisClient.hgetall('price', (error, replies) => {
      if (error) {
        reject(error);
      } else {
        resove(replies);
      }
    });
  });
}

async function chartDataSets() {
  const prices = await getPrices();
  const locations = await getLocations();
  return _(prices)
    .map((priceString, key) => {
      const id = key.substring(25);
      const date = moment(key.substring(0, 24));
      const price = parseFloat(priceString);
      return {id, date, price};
    })
    .filter(
      value => (chartLocations.length === 0 || chartLocations.includes(value.id))
        && value.price > chartPriceMin
        && value.price < chartPriceMax
        && moment().diff(value.date, 'days') < chartDays
    )
    .sortBy('date')
    .groupBy('id')
    .mapValues((values, id) =>
      ({
        label: _.find(locations, {id: parseInt(id)}).name,
        data: values.map(value => ({x: value.date, y: value.price})),
        fill: false
      }))
    .values()
    .value();
}

const app = express();

app.get('/locations', (request, response) => {
  getLocations()
    .then(locations => ({locations}))
    .then(response.send.bind(response))
    .catch(error => {
      console.error(error);
      return response.sendStatus(500);
    });
});

app.get('/chart', (request, response) => {
  chartDataSets()
    .then(datasets => ({
      type: 'line',
      data: {datasets},
      options: {
        scales: {
          xAxes: [{
            type: 'time'
          }]
        }
      }
    }))
    .then(response.send.bind(response))
    .catch(error => {
      console.error(error);
      return response.sendStatus(500);
    });
});

app.use(express.static(path.resolve(__dirname, 'public')));

app.listen(port, () => console.log(`Price app listening on port ${port}!`));
