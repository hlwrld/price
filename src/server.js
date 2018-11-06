const path = require('path');
const _ = require('lodash');
const moment = require('moment');
const redis = require('redis');
const express = require('express');

const env = process.env;
const port = env.PORT;

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
  return _(prices)
    .map((priceString, key) => {
      const id = parseInt(key.substring(25));
      const date = moment(key.substring(0, 24));
      const price = parseFloat(priceString);
      return {id, date, price};
    })
    .filter(value => value.price > 10 && value.price < 20 && value.date.diff(moment(), 'days') > -30)
    .sortBy('date')
    .groupBy('id')
    .mapValues((values, key) => ({
      label: key,
      data: values.map(value => ({x: value.date, y: value.price})),
      fill: false
    }))
    .values()
    .value();
}

const app = express();

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
