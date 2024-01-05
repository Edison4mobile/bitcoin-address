# Bitcoin Address Sync

Bitcoin Address Sync is a repository used to sync all Bitcoin addresses and save balances inside a MySQL database. It also provides a Swagger API documentation for using the provided APIs.

## Environment Variables
Set the following environment variables in your system or hosting environment:

- `DB_HOST`: The IP address of your MySQL database (e.g., 127.0.0.1).
- `DB_USER`: The username for accessing the MySQL database.
- `DB_PASSWORD`: The password for accessing the MySQL database.
- `DB_DATABASE`: The name of the MySQL database to be used for storing Bitcoin address balances.
- `SERVER_PORT`: The port number on which the server will run (e.g., 8000).
- `SYNC_END_BLOCK_NUMBER`: The block number until which the Bitcoin addresses should be synced.
- `EXPLORER_API_ENDPOINT`: The endpoint of the Bitcoin explorer API to retrieve address balances.

## Installation and Dependencies

Follow the instructions below to install the necessary dependencies and set up the environment.

### 1. Install MySQL
To install MySQL on Ubuntu 20.04, you can refer to the following guide: [How To Install MySQL on Ubuntu 20.04](https://www.digitalocean.com/community/tutorials/how-to-install-mysql-on-ubuntu-20-04).

### 2. Install Node.js
To install Node.js on Ubuntu 20.04, you can refer to the following guide: [How To Install Node.js on Ubuntu 20.04](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04).

### 3. Install Yarn
Yarn is a package manager for Node.js. You can install it globally by running the following command:

```bash
npm install -g yarn
```
### 4. Install Dependencies
To install the project dependencies, navigate to the project directory and run the following command:

```bash
yarn install
```

## Usage
Follow the instructions below to run the Bitcoin Address Sync application.
### Debug Mode
To run the application in debug mode, use the following command:

```bash
yarn run debug
```
### Production Mode
To run the application in production mode, use the following command:

```bash
yarn start
```

## Publishing a Release
To publish a release, follow the steps below:

1. Log in to the npm registry:
```bash
yarn npm:login
```

2. Publish the release:
```bash
yarn npm:publish
```
Please note that you should have the necessary permissions and credentials to publish the release.

For any further assistance or queries, feel free to contact us.

## How to use
1. Create a .env file based on the provided .env.example file.
2. Install the bitcoin-address-sync package:
```bash
npm install bitcoin-address-sync
```
3. Require bitcoin-address-sync in your code:
```javascript
require('bitcoin-address-sync');
```

<img width="2239" alt="Screenshot 2024-01-05 at 6 06 30 PM" src="https://github.com/Edison4mobile/bitcoin-address/assets/31374816/49052164-f553-4e80-aac8-88e0ea2f4556">
