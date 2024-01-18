const { default: axios } = require("axios");
const { bech32 } = require("bech32");
const { hash160 } = require("bitcoinjs-lib/src/crypto");
const { bitcoin } = require("bitcoinjs-lib/src/networks");
const { p2pkh, p2wpkh } = require("bitcoinjs-lib/src/payments");
const express = require("express");
const mysql = require("mysql2");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

require("dotenv").config();

const app = express();
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const extractAddress = (scriptPubKey) => {
  try {
    if (
      scriptPubKey.type === "pubkeyhash" ||
      scriptPubKey.type === "scripthash" ||
      scriptPubKey.address
    ) {
      return scriptPubKey.address;
    } else if (scriptPubKey.type === "pubkey") {
      const pubkeyBuffer = Buffer.from(scriptPubKey.hex, "hex");
      const pubKeyHash = hash160(pubkeyBuffer);
      const publicKeyHashBytes = Buffer.from(pubKeyHash, "hex");
      const address = bech32.encode("bc", bech32.toWords(publicKeyHashBytes));
      return address;
    }
    // Add more conditions for other types if necessary
  } catch (error) {
    console.error("Error in extractAddress:", error.message);
    return null;
  }
  return null;
};

const callDaemon = async (method, params) => {
  const rpcRequest = {
    jsonrpc: "1.0",
    id: "curltext",
    method: method,
    params: params,
  };
  const auth = {
    username: process.env.DAEMON_USER,
    password: process.env.DAEMON_PASSWORD,
  };
  try {
    const response = await axios.post(
      process.env.DAEMON_API_ENDPOINT,
      rpcRequest,
      { auth }
    );
    const result = response.data.result;
    return result;
  } catch (error) {
    throw error?.response?.data?.error?.message ?? error.message;
  }
};

const getBlockHash = async (block) => {
  return await callDaemon("getblockhash", block);
};

const getBlock = async (hash) => {
  return await callDaemon("getblock", hash);
};

const getRawTransaction = async (txHash) => {
  return await callDaemon("getrawtransaction", txHash);
};

const getBitcoinInfo = (address, callback) => {
  const query = "SELECT address, balance FROM addresses WHERE address = ?";
  connection.query(query, [address], (err, results) => {
    if (err) {
      console.error("Error retrieving Bitcoin info:", err);
      callback(null);
      return;
    }

    if (results.length > 0) {
      const { address, balance } = results[0];
      const bitcoinInfo = {
        address: address,
        balance: balance,
      };
      callback(bitcoinInfo);
    } else {
      callback(null);
    }
  });
};

const getSyncedBLockNumber = (callback) => {
  const query =
    "SELECT status_value FROM status WHERE status_key = 'blockNumber'";

  connection.query(query, (err, results) => {
    if (err) {
      callback(-1);
      return;
    }

    if (results.length > 0) {
      const { status_value } = results[0];
      callback(status_value);
    } else {
      callback(0);
    }
  });
};

const getTotalAddressCount = (callback) => {
  const query = "SELECT COUNT(*) as totalCount FROM addresses";

  connection.query(query, (err, results) => {
    if (err) {
      callback(-1);
      return;
    }
    if (!results) {
      callback(0);
      return;
    }
    callback(results[0].totalCount ?? 0);
  });
};

const getSyncedSucceed = (
  pageNumber,
  pageSize,
  direction,
  orderBy,
  hasBalance,
  callback
) => {
  const offset = pageNumber * pageSize;
  const query = `SELECT * FROM addresses ${
    hasBalance == 1 ? "WHERE balance > 0" : ""
  } ORDER BY ${orderBy} ${direction} LIMIT ${pageSize} OFFSET ${offset}`;
  connection.query(query, (err, results) => {
    if (err) {
      callback(null);
    } else {
      const totalCountQuery = `SELECT COUNT(*) as totalCount FROM addresses ${
        hasBalance == 1 ? "WHERE balance > 0" : ""
      }`;
      connection.query(totalCountQuery, (err, countResult) => {
        if (err) {
          callback(null);
        } else {
          const totalCount = countResult[0].totalCount;
          const totalPages = Math.ceil(totalCount / pageSize);

          const response = {
            results,
            pagination: {
              totalPages,
              pageNumber: parseInt(pageNumber),
              pageSize: parseInt(pageSize),
              direction,
              orderBy,
            },
          };
          callback(response);
        }
      });
    }
  });
};

const getSyncedFailed = (callback) => {
  const query = `SELECT * FROM failed`;

  connection.query(query, (err, results) => {
    if (err) {
      callback(null);
    } else {
      callback(results);
    }
  });
};

const updateStatusKey = (tableName, key, value) => {
  return new Promise((resolve, reject) => {
    const selectQuery = `SELECT * FROM ${tableName} WHERE status_key = ?`;
    connection.query(selectQuery, [key], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      if (results.length > 0) {
        // Update existing record
        const updateQuery = `UPDATE ${tableName} SET status_value = ? WHERE status_key = ?`;
        connection.query(updateQuery, [value, key], (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      } else {
        // Create new record
        const insertQuery = `INSERT INTO ${tableName} (status_key, status_value) VALUES (?, ?)`;
        connection.query(insertQuery, [key, value], (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      }
    });
  });
};

const createTables = (callback) => {
  const createAddressTableQuery = `CREATE TABLE IF NOT EXISTS addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address VARCHAR(80),
    balance FLOAT DEFAULT 0,
    blockNumber INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`;

  connection.query(createAddressTableQuery, (err) => {
    if (err) {
      console.error("Error creating address table:", err);
      return;
    }

    const createStatusTableQuery = `CREATE TABLE IF NOT EXISTS status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      status_key VARCHAR(50),
      status_value VARCHAR(256),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`;

    connection.query(createStatusTableQuery, (err) => {
      if (err) {
        console.error("Error creating status table:", err);
        return;
      }
      const createfailedTableQuery = `CREATE TABLE IF NOT EXISTS failed (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blockNumber INT,
        message VARCHAR(4096),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`;

      connection.query(createfailedTableQuery, (err) => {
        if (err) {
          console.error("Error creating failed table:", err);
          return;
        }
        callback();
      });
    });
  });
};

const createServer = () => {
  const serverPort = process.env.SERVER_PORT || 3000;
  app.listen(serverPort, () => {
    console.log(`Server is running on port ${serverPort}`);
  });
};

const getBlockTxInfo = (blockNumber, page) => {
  return new Promise((resolve, reject) => {
    fetch(
      `${process.env.EXPLORER_API_ENDPOINT}/block/${blockNumber}/tx?page=${page}`
    )
      .then((res) => {
        if (res.status !== 200) {
          reject(res.statusText);
          return res.statusText;
        }
        return res.json();
      })
      .then((response) => {
        resolve(response);
      })
      .catch((err) => {
        reject(err?.message);
      });
  });
};

const getInputOutputAddressesFromTx = (tx) => {
  const addresses = new Set();

  for (const item of tx) {
    for (const input of item.inputs) {
      input.prev_addresses.forEach((address) => {
        if (address) {
          addresses.add(address);
        }
      });
    }
    for (const output of item.outputs) {
      output.addresses.forEach((address) => {
        if (address) {
          addresses.add(address);
        }
      });
    }
  }
  return Array.from(addresses);
};

const getBlockInfo = async (blockNumber) => {
  const addresses = [];
  const firstPageInfo = await getBlockTxInfo(blockNumber, 1);
  if (firstPageInfo?.status !== "success") {
    throw "Unable to get block tx info";
  }
  addresses.push(
    ...getInputOutputAddressesFromTx(firstPageInfo?.data?.list ?? [])
  );

  const pageTotal = parseInt(firstPageInfo?.data?.page_total);
  if (pageTotal > 1) {
    for (let index = 2; index < pageTotal + 1; index++) {
      const nextPageInfo = await getBlockTxInfo(blockNumber, index);
      addresses.push(
        ...getInputOutputAddressesFromTx(nextPageInfo?.data?.list ?? [])
      );
    }
  }

  const uniqueAddresses = Array.from(new Set(addresses));
  const newAddresses = [];
  for (const address of uniqueAddresses) {
    if (!(await getAddressRecord(address))) newAddresses.push(address);
  }
  const promises = newAddresses.map((address) => {
    if (process.env.ADDRESS_SYNC_ONLY === "1")
      return {
        data: {
          address: address,
          balance: 0,
        },
      };
    return getBalance(address);
  });
  const response = await Promise.all(promises);
  return response.map((item) => {
    return {
      address: item.data.address,
      balance: item.data.balance,
    };
  });
};

const getBalance = (address) => {
  return new Promise((resolve, reject) => {
    fetch(`${process.env.EXPLORER_API_ENDPOINT}/address/${address}`)
      .then((res) => {
        if (res.status !== 200) {
          reject(res.statusText);
          return res.statusText;
        }
        return res.json();
      })
      .then((response) => {
        resolve(response);
      })
      .catch((err) => {
        reject(err?.message);
      });
  });
};

const getAddressRecord = (address) => {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM addresses WHERE address = ?";
    connection.query(query, [address], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      if (results.length > 0) {
        resolve(results[0]);
      } else {
        resolve(null);
      }
    });
  });
};

const updateAddressBalance = (address, blockNumber, balance) => {
  return new Promise((resolve, reject) => {
    const query =
      "UPDATE addresses SET balance = ?, blockNumber = ? WHERE address = ?";
    connection.query(query, [balance, blockNumber, address], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

const addFailedRecord = (blockNumber, message) => {
  if (!message) {
    message = "";
  }
  message = message.substr(0, Math.min(message.length, 4096));
  return new Promise((resolve, reject) => {
    const query = "INSERT INTO failed (blockNumber, message) VALUES (?, ?)";
    connection.query(query, [blockNumber, message], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

const removeFailedRecord = (blockNumber) => {
  return new Promise((resolve, reject) => {
    const query = "DELETE FROM failed WHERE blockNumber = ?";
    connection.query(query, [blockNumber], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

const addNewAddressRecord = (address, blockNumber, balance) => {
  return new Promise((resolve, reject) => {
    const query =
      "INSERT INTO addresses (address, blockNumber, balance) VALUES (?, ?, ?)";
    connection.query(query, [address, blockNumber, balance], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

const syncFailedBlocks = async (failed_blocks) => {
  const fails = [];
  const succeeds = [];
  for (const fail of failed_blocks) {
    try {
      const info = await getBlockInfo(fail.blockNumber);
      for (const item of info) {
        const address = item.address;
        const balance = item.balance;

        const existingRecord = await getAddressRecord(address);
        if (existingRecord) {
          await updateAddressBalance(address, fail.blockNumber, balance);
        } else {
          await addNewAddressRecord(address, fail.blockNumber, balance);
        }
        succeeds.push(item);
      }
      await removeFailedRecord(fail.blockNumber);
    } catch (error) {
      console.log(error?.message ?? JSON.stringify(error));
      fails.push(fail);
    }
  }
  return { fails, succeeds };
};

const syncBlocks = async (start, end) => {
  console.log(start, end);
  if (end <= start) {
    console.log("Bitcoin block was already synced");
  } else {
    console.log("sync start");
    console.log(new Date());
    const totalBlocks = end - start + 1;
    let processedBlocks = 0;

    for (let index = start; index < end + 1; index++) {
      try {
        const info = await getBlockInfo(index);
        for (const item of info) {
          const address = item.address;
          const balance = item.balance;

          const existingRecord = await getAddressRecord(address);
          if (existingRecord) {
            await updateAddressBalance(address, index, balance);
          } else {
            await addNewAddressRecord(address, index, balance);
          }
        }
      } catch (error) {
        console.log(error?.message ?? JSON.stringify(error));
        await addFailedRecord(index, error?.message ?? JSON.stringify(error));
      }
      await updateStatusKey("status", "blockNumber", index);

      processedBlocks++;
      const progress = (processedBlocks / totalBlocks) * 100;
      process.stdout.write(
        `Progress: ${progress.toFixed(10)}% ${processedBlocks}/${totalBlocks}\r`
      );
    }

    console.log("\n"); // Add a newline after the loop completes
    console.log("sync end");
    console.log(new Date());
  }
};

const syncRpcBlocks = async (start, end) => {
  console.log(start, end);
  if (end <= start) {
    console.log("Bitcoin block was already synced");
  } else {
    console.log("sync start");
    console.log(new Date());
    const totalBlocks = end - start + 1;
    let processedBlocks = 0;

    for (let index = start; index < end + 1; index++) {
      try {
        const blockHash = await getBlockHash([index]);
        const block = await getBlock([blockHash]);
        const txs = block.tx;
        const addresses = {};
        for (const tx of txs) {
          const transaction = await getRawTransaction([tx, true]);
          for (const out of transaction.vout) {
            if (out.scriptPubKey.address) {
              addresses[out.scriptPubKey.address] = 0;
            } else {
              addresses[extractAddress(out.scriptPubKey)] = 0;
            }
          }
        }
        for (const address of Object.keys(addresses)) {
          const existingRecord = await getAddressRecord(address);
          if (!existingRecord) {
            await addNewAddressRecord(address, index, 0);
          }
        }
      } catch (error) {
        console.log(error?.message ?? JSON.stringify(error));
        await addFailedRecord(index, error?.message ?? JSON.stringify(error));
      }
      await updateStatusKey("status", "blockNumber", index);

      processedBlocks++;
      const progress = (processedBlocks / totalBlocks) * 100;
      process.stdout.write(
        `Progress: ${progress.toFixed(10)}% ${processedBlocks}/${totalBlocks}\r`
      );
    }

    console.log("\n"); // Add a newline after the loop completes
    console.log("sync end");
    console.log(new Date());
  }
};

const startSync = () => {
  const syncEndBlockNumber = parseInt(process.env.SYNC_END_BLOCK_NUMBER);
  getSyncedBLockNumber((blockNumber) => {
    if (blockNumber < -1) {
      console.log("Cannot start sync");
    } else {
      createServer();
      syncRpcBlocks(parseInt(blockNumber) + 1, syncEndBlockNumber);
    }
  });
};

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }

  connection.query(
    `CREATE DATABASE IF NOT EXISTS ${process.env.DB_DATABASE}`,
    (err, results) => {
      if (err) {
        console.error("Error creating database:", err);
        return;
      }

      console.log("Database connected or created successfully.");
      connection.query(`USE ${process.env.DB_DATABASE}`, (err) => {
        if (err) {
          console.error("Error selecting database:", err);
          return;
        }
        createTables(() => {
          startSync();
        });
      });
    }
  );
});

// Swagger options
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Bitcoin Address API",
      version: "1.0.0",
      description: "API for managing Bitcoin addresses",
    },
  },
  apis: ["./index.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /address/info:
 *   get:
 *     summary: Get Bitcoin info by address
 *     tags: [Bitcoin Address]
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         description: Bitcoin address
 *     responses:
 *       200:
 *         description: Bitcoin info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   description: Bitcoin address
 *                 balance:
 *                   type: number
 *                   description: Bitcoin balance
 *                   example: 2.5
 *       404:
 *         description: 404 Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 * components:
 *   schemas:
 *     AddressInfo:
 *       type: object
 *       properties:
 *         address:
 *           type: string
 *         balance:
 *           type: number
 */
app.get("/address/info", (req, res) => {
  const { address } = req.query;

  getBitcoinInfo(address, (bitcoinInfo) => {
    if (bitcoinInfo) {
      res.status(200).json(bitcoinInfo);
    } else {
      res.status(404).json({ error: "Address not found" });
    }
  });
});

/**
 * @swagger
 * /sync/status:
 *   get:
 *     summary: Bitcoin sync status
 *     tags: [Bitcoin Address]
 *     responses:
 *       200:
 *         description: Bitcoin sync status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 blockNumber:
 *                   type: integer
 *                   description: The current block number synced
 *                 addressCount:
 *                   type: integer
 *                   description: Total address count
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.get("/sync/status", (req, res) => {
  getSyncedBLockNumber((blockNumber) => {
    if (blockNumber < 0) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      getTotalAddressCount((addressCount) => {
        if (blockNumber < 0) {
          res.status(500).json({ error: "Internal server error" });
        } else {
          res
            .status(200)
            .json({ blockNumber: parseInt(blockNumber), addressCount });
        }
      });
    }
  });
});

/**
 * @swagger
 * /sync/succeed:
 *   get:
 *     summary: Get addresses with balance greater than 0
 *     tags: [Bitcoin Address]
 *     parameters:
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 100
 *         description: Number of results to return per page
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Page number to retrieve
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [DESC, ASC]
 *           default: DESC
 *         description: Sort direction (DESC or ASC)
 *       - in: query
 *         name: hasBalance
 *         schema:
 *           type: number
 *           enum: [0, 1]
 *           default: 0
 *         description: Has balance(0 or 1)
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [balance, blockNumber]
 *           default: balance
 *     responses:
 *       200:
 *         description: Addresses with balance greater than 0
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Address'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         address:
 *           type: string
 *         blockNumber:
 *           type: integer
 *         balance:
 *           type: number
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     Pagination:
 *       type: object
 *       properties:
 *         totalPages:
 *           type: integer
 *         pageNumber:
 *           type: integer
 *         pageSize:
 *           type: integer
 *         orderBy:
 *           type: string
 *           enum: [balance, blockNumber]
 *         direction:
 *           type: string
 *           enum: [DESC, ASC]
 */
app.get("/sync/succeed", (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 100;
  const pageNumber = parseInt(req.query.pageNumber) || 0;
  const hasBalance = parseInt(req.query.hasBalance) || 0;
  let direction = req.query.direction || "DESC";
  let orderBy = req.query.orderBy || "balance";

  if (direction !== "DESC" && direction !== "ASC") {
    direction = "DESC";
  }

  if (orderBy !== "balance" && orderBy !== "blockNumber") {
    orderBy = "balance";
  }

  getSyncedSucceed(
    pageNumber,
    pageSize,
    direction,
    orderBy,
    hasBalance,
    (results) => {
      if (!results) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.status(200).json(results);
      }
    }
  );
});

/**
 * @swagger
 * /sync/failed:
 *   get:
 *     summary: Get failed block number list
 *     tags: [Bitcoin Address]
 *     responses:
 *       200:
 *         description: Get failed block number list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Failed'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 * components:
 *   schemas:
 *     Failed:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         blockNumber:
 *           type: number
 *         message:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */
app.get("/sync/failed", (req, res) => {
  getSyncedFailed((results) => {
    if (!results) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.status(200).json(results);
    }
  });
});

/**
 * @swagger
 * /sync/retry:
 *   post:
 *     summary: Retry failed block numbers
 *     tags: [Bitcoin Address]
 *     responses:
 *       200:
 *         description: Retry failed block numbers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *
 *                 succeeds:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AddressInfo'
 *                 fails:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Failed'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.post("/sync/retry", (req, res) => {
  getSyncedFailed(async (results) => {
    if (!results) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      try {
        res.status(200).json(await syncFailedBlocks(results));
      } catch (error) {
        console;
        res.status(500).json({ error: error?.message ?? error });
      }
    }
  });
});
