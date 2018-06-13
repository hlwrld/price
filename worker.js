const _ = require('lodash');
const request = require('request-json');
const redis = require('redis');

const env = process.env;

const access_key = env.ACCESS_KEY;
const apiURL = env.API_URL;
const locationsURL = env.LOCATIONS_URL;
const pricesURL = env.PRICES_URL;
const locationFilter = new RegExp(env.LOCATION_FILTER);

const lastmodified = '1970-01-01';

console.log('ACCESS_KEY=', access_key);
console.log('LOCATIONS_URL=',locationsURL);
console.log('PRICES_URL=', pricesURL);
console.log('LOCATION_FILTER=', locationFilter);

const httpClient = request.createClient(apiURL);

async function getLocationIds() {
  const response = await httpClient.post(locationsURL, {access_key, lastmodified});
  return response.body
    .filter(location => locationFilter.test(location.address))
    .map(location => location.id);
}

async function getPrices(station_ids){
  const response = await httpClient.post(pricesURL, {access_key, station_ids});
  return _(response.body)
    .map(location =>
      location.prices
        .filter(price => price.octane === 'B95')
        .map(price => ({
          station: location.stationid,
          date: price.entrydate,
          price: price.price
        }))
    )
    .flatten()
    .sortBy('date')
    .value();
}

function storePrices(prices) {
  if (!env.REDIS_URL) {
    return;
  }
  const redisClient = redis.createClient(env.REDIS_URL);
  prices.forEach(price => {
    redisClient.hset('price', `${price.date}-${price.station}`, price.price)
  });
}

getLocationIds().then(getPrices).then(storePrices);
