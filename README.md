# Bitcoin address sync
This repository is used to sync all bitcoin addresses and save balances inside mysql database.
This also provides a kind swagger api documentation so that you can use apis that are provided.

## Env variables
DB_HOST=127.0.0.1
DB_USER=
DB_PASSWORD=
DB_DATABASE=bitcoin
SERVER_PORT=8000
SYNC_END_BLOCK_NUMBER=5

EXPLORER_API_ENDPOINT=

## Install mysql
https://www.digitalocean.com/community/tutorials/how-to-install-mysql-on-ubuntu-20-04

## Install node
https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04
## Install yarn
npm install yarn -g
## Install Dependencies
yarn

## Run in debug mode
yarn dev

## Run in product mode
yarn start

## Open in Browser
http://localhost:8000/docs

## Publish a release
yarn npm:login
yarn npm:publish


 
