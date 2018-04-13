(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
const ethnet = require('./ethnet');
const view = require('./view');
const error = require('./error');

// Module storage
const app = {};

window.addEventListener('load', () => {
  view.init();

  init();
});

async function init() {
  // Get the deployed game contract
  app.crafty = await ethnet.getDeployedCrafty();

  if (!app.crafty) {
    // Nothing to do if no Crafty object was created
    return;
  }

  // The UI is built based on the available craftables
  await loadCraftables();

  // Build the UI
  buildUI();

  // Account changes trigger an inventory update
  ethnet.onAccountChange(account => {
    if (account) {
      error.clear(); // Hacky - this clears the (possible) previous no account error

      view.setAccount(account);
      updateInventory();
    } else {
      error.noEthAccount();
    }
  });

  // New blocks also trigger an inventory update
  ethnet.onNewBlock(block => {
    view.setBlock(block);
    updateInventory();
  });
}

/*
 * Loads the game rules and creates the craftables data structure using that
 * information.
 */
async function loadCraftables() {
  const rules = await $.getJSON('rules.json');
  app.craftables = rules.craftables;

  await Promise.all(app.craftables.map(async (craftable) => {
    craftable.address = await app.crafty.getCraftable(craftable.name);

    // The UI property is used to store view callbacks and other UI-related
    // data
    craftable.ui = {
      pendingTxs: []
    };
  }));
}

/*
 * Builds the UI (inventory, actions, recipes) from the craftables data
 * structure, adding UI callbacks to it.
 */
function buildUI() {
  const basicItems = app.craftables.filter(craftable => craftable.ingredients.length === 0);
  const advItems = app.craftables.filter(craftable => craftable.ingredients.length > 0);

  // Inventory
  view.addItemList(basicItems, $('#basic-item-inv'));
  view.addItemList(advItems, $('#adv-item-inv'));

  // Actions
  view.addCraftButtons(basicItems, onCraft, $('#mine-actions'));
  view.addCraftButtons(advItems, onCraft, $('#craft-actions'));

  // Recipes
  view.addIngredientsList(app.craftables.filter(craftable => craftable.ingredients.length > 0), $('#recipes'));
}

/*
 * Calls the craft function on the contract, storing the transaction's hash to
 * enable optimistic updates.
 */
async function onCraft(craftable) {
  try {
    // sendTransaction returns immediately after the transaction is broadcasted
    // (i.e. after it is signed by the Ethereum Browser)
    const txHash = await app.crafty.craft.sendTransaction(craftable.name);

    craftable.ui.pendingTxs.push({hash: txHash});
    // Trigger a UI update to reflect the new pending transaction
    updateUI();

  } catch (e) {
    // The transaction did not fail, it was simply never sent
    view.toastFailedToSendTx();
  }
}

/*
 * Fetches the current balance of each craftable (taking into account pending
 * transactions) and updates the UI. Confirmed transactions are removed from
 * the pending lists.
 */
async function updateInventory() {
  // Retrieve the new balances and store them in a temporary inventory
  const newInventory = {};
  await Promise.all(app.craftables.map(craftable => {
    return app.crafty.getAmount(craftable.name).then(amount => {
      newInventory[craftable.name] = Number(amount);
    });
  }));

  await clearConfirmedTXs();

  // Only update the real inventory once all balances were retrieved and
  // confirmed transactions removed, to prevent access during the update
  app.inventory = newInventory;

  // Update the UI using the updated data
  updateUI();
}

/*
 * Removes all confirmed transactions from the pending transactions lists.
 */
async function clearConfirmedTXs() {
  // We can't simply call filter because ethnet.isTxConfirmed is async, so we
  // store that data along the hash, and then filter synchronously.
  await Promise.all(app.craftables.map(async (craftable) => {
    await Promise.all(craftable.ui.pendingTxs.map(async tx => {
      tx.confirmed = await ethnet.isTxConfirmed(tx.hash);

      if (tx.confirmed) {
        // Confirmed transactions may have failed (asserts, etc.)
        const successful = await ethnet.isTxSuccessful(tx.hash);
        if (successful) {
          view.toastSuccessfulTx(tx.hash, ethnet.txUrl(tx.hash));
        } else {
          view.toastErrorTx();
        }
      }
    }));
  }));

  app.craftables.forEach(craftable => {
    craftable.ui.pendingTxs = craftable.ui.pendingTxs.filter(tx => !tx.confirmed);
  });
}

/*
 * Updates the UI from the current inventory, without updating it.
 */
function updateUI() {
  // Optimistically update the amounts (assuming the pending transactions will
  // succeed). We work on temporary inventories, to prevent modifying the real
  // one (which is only updated by reading from the blockchain).

  const pendingInventory = {}; // Used to track pending craftables
  const uiInventory = JSON.parse(JSON.stringify(app.inventory)); // Deep copy

  // We need to calculate the whole optimistic inventory before the UI can be
  // updated
  app.craftables.forEach(craftable => {
    const pendingAmount = craftable.ui.pendingTxs.length;

    // Pending craftables are not added to the UI inventory to prevent not-yet
    // crafted craftables from being used as ingredients (which will likely
    // fail)
    pendingInventory[craftable.name] = pendingAmount;

    // Ingredients of pending transactions, however, are subtracted from the
    // current amount, to prevent them from being used again (this will roll
    // back if the transaction fails)
    craftable.ingredients.forEach(ingredient => {
      uiInventory[ingredient.name] -= pendingAmount * ingredient.amount;
    });
  });

  app.craftables.forEach(craftable => {
    // Then, update the displayed amount, and the craftability
    craftable.ui.updateAmount(uiInventory[craftable.name], pendingInventory[craftable.name]);
    craftable.ui.enableCraft(isCraftable(craftable, uiInventory));
  });
}

/*
 * Calculates if a craftable can be crafted given the current balance in an
 * inventory.
 */
function isCraftable(craftable, inventory) {
  // Check all ingredients are present for the craftable
  return craftable.ingredients.every(ingredient =>
    inventory[ingredient.name] >= ingredient.amount
  );
}

},{"./error":2,"./ethnet":3,"./view":4}],2:[function(require,module,exports){
const view = require('./view');

/*
 * Displays an error message indicating a lack of an Ethereum browser.
 */
exports.noEthBrowser = () => {
  view.showModalError(`
    <p>An Ethereum browser (such as <a href="https://metamask.io/">MetaMask</a> or <a href="https://github.com/ethereum/mist">Mist</a>) is required to use this dApp.</p>
    <div style="display: flex; justify-content: center;">
      <a href="https://metamask.io/" style="text-align: center">
        <img src="images/download-metamask-dark.png" style="max-width: 70%">
      </a>
    </div>`);
};

/*
 * Displays an error message indicating no adddresses for a deployed Crafty
 * contract in this network are known.
 */
exports.noCraftyAddress = () => {
  view.showModalError('<p>No address for a Crafty smart contract in this network. Update contract-addresses.json with a valid address, or switch to a different network.</p>');
};

/*
 * Displays an error message indicating a deployed Crafty contract could not
 * be found in the current network.
 */
exports.noDeployedCrafty = () => {
  view.showModalError('<p>Could not find an up-to-date Crafty smart contract in this network. Deploy one before continuing.</p>');
};

/*
 * Displays an error message indicating no Ethereum account is selected.
 */
exports.noEthAccount = () => {
  view.setAccount('none');
  view.showModalError('<p>An Ethereum account needs to be selected in the Ethereum browser extension in order to use this dApp.</p>');
};

/*
 * Clears all error messages.
 */
exports.clear = () => {
  view.hideModalError();
};

},{"./view":4}],3:[function(require,module,exports){
const view = require('./view');
const error = require('./error');

// Module storage
const ethnet = {};

/*
 * Initializes the ethnet module.
 * @returns true when initialization is successful.
 */
function init() {
  if (typeof web3 === 'undefined') {
    error.noEthBrowser();
  }

  // Create a new web3 object using the current provider
  ethnet.web3 = new Web3(web3.currentProvider);
  // And promisify the callback functions that we use
  Promise.promisifyAll(ethnet.web3.version, {suffix: 'Async'});
  Promise.promisifyAll(ethnet.web3.eth, {suffix: 'Async'});

  if (ethnet.web3.currentProvider.isMetaMask) {
    view.showMetaMaskBadge();
  }

  return true;
}

/*
 * Returns true when the transaction has been confirmed.
 */
exports.isTxConfirmed = async (txHash) => {
  const tx = await ethnet.web3.eth.getTransactionAsync(txHash);

  // A transaction is considered confirmed once it's in a block that we have
  // seen (blockNumber is null when the transaction is pending)
  return ((tx.blockNumber !== null) && (tx.blockNumber <= ethnet.currentBlock.number));
};

/*
 * Returns true when a transaction was successful. The transaction is assumed
 * to be confirmed.
 */
exports.isTxSuccessful = async (txHash) => {
  const receipt = await ethnet.web3.eth.getTransactionReceiptAsync(txHash);
  return Number(receipt.status) !== 0;
};

/*
 * Creates a crafty contract object, used to interact with a deployed instance.
 * @returns the created contract, or undefined if one wasn't found.
 */
exports.getDeployedCrafty = async () => {
  if (!init()) {
    return;
  }

  // We need to figure out in which network we're in to fetch the appropiate
  // contract address
  ethnet.netId = await ethnet.web3.version.getNetworkAsync();
  view.setEthnetName(netInfo[ethnet.netId] ? netInfo[ethnet.netId].name : 'unknown');

  const craftyAddress = await netCraftyAddress(ethnet.netId);
  if (!craftyAddress) {
    error.noCraftyAddress();
    return;
  }

  const codeAtAddress = await ethnet.web3.eth.getCodeAsync(craftyAddress);

  // We're not checking the actual code, only that there is a contract there.
  // This may yield false positives if the contract code changes but the
  // address isn't updated.
  if (codeAtAddress.length <= '0x'.length) {
    error.noDeployedCrafty();
    return;
  }

  // We have a deployed contract in the network! Load the built artifact
  // and create a contract object deployed at that address.
  const craftyArtifact = await $.getJSON('contracts/Crafty.json');
  const contract = TruffleContract(craftyArtifact);
  contract.setProvider(ethnet.web3.currentProvider);

  return contract.at(craftyAddress);
};

/*
 * Registers a callback to be called whenever the Ethereum account changes
 * on the Ethereum browser. The callback is also called immediately.
 * @param handler A function that receives an Ethereum account.
 */
exports.onAccountChange = (handler) => {
  ethnet.currentAccount = ethnet.web3.eth.accounts[0];
  // Call the handler callback once with the current account
  handler(ethnet.currentAccount);

  // There's no account change event, so we need to poll and manually check
  // for account changes
  setInterval(() => {
    const newAccount = ethnet.web3.eth.accounts[0];

    if (ethnet.currentAccount !== newAccount) {
      ethnet.currentAccount = newAccount;

      handler(ethnet.currentAccount);
    }
  }, 100);
};

/*
 * Registers a callback to be called whenever a new block is mined. The
 * callback is also called immediately.
 * @param handler A function that receives a block.
 */
exports.onNewBlock = async (handler) => {
  ethnet.currentBlock = await ethnet.web3.eth.getBlockAsync('latest');
  // Call the handler callback once with the current block
  handler(ethnet.currentBlock);

  // Most web3 providers don't support new block events, so we need to poll
  // and manually check for new blocks
  setInterval(async () => {
    const newBlock = await ethnet.web3.eth.getBlockAsync('latest');

    if (ethnet.currentBlock.number !== newBlock.number) {
      ethnet.currentBlock = newBlock;
      handler(ethnet.currentBlock);
    }
  }, 1000);
};

/*
 * Returns an URL from a transaction hash, linking to information about that
 * transaction.
 */
exports.txUrl = (tx) => {
  return netInfo[ethnet.netId] ? netInfo[ethnet.netId].txUrlGen(tx) : '';
};

/*
 * Returns the address of a known deployed crafty contract for a given network
 * id.
 */
async function netCraftyAddress(netId) {
  const addresses = await $.getJSON('contract-addresses.json');
  if (addresses[netId]) {
    return addresses[netId];
  } else {
    return addresses['unknown']; // Used during local development
  }
}

// Misc information about the different networks
const netInfo = {
  '1': {
    'name': 'mainnet',
    'txUrlGen': tx => `https://etherscan.io/tx/${tx}`
  },
  '2': {
    'name': 'Morden (testnet - deprecated)',
    'txUrlGen': () => ``
  },
  '3': {
    'name': 'Ropsten (testnet)',
    'txUrlGen': tx => `https://ropsten.etherscan.io/tx/${tx}`
  },
  '4': {
    'name': 'Rinkeby (testnet)',
    'txUrlGen': tx => `https://rinkeby.etherscan.io/tx/${tx}`
  },
  '42': {
    'name': 'Kovan (testnet)',
    'txUrlGen': tx => `https://kovan.etherscan.io/tx/${tx}`
  }
};

},{"./error":2,"./view":4}],4:[function(require,module,exports){
const toClipboard = require('copy-to-clipboard');

// Module storage
const view = {};

/*
 * Initializes the view.
 */
exports.init = () => {
  $(function () {
    $('[data-toggle="tooltip"]').tooltip({
      trigger: 'hover'
    });
  });
};

/*
 * Creates an HTML list of craftables, displaying name and value.
 * @param craftables An array of craftables.
 * @param parent The HTML object the list is going to be appended to.
 * An updateAmount function is added to the UI property of each craftable,
 * which receives a craftable's current and pending amounts and updates the DOM.
 */
exports.addItemList = (craftables, parent) => {
  const list = $('<ul>').addClass('list-group').css({'background-color': 'transparent'});
  craftables.forEach(craftable => {
    const li = $('<li>').addClass('list-group-item').css({'background-color': 'transparent'}).addClass('border-0');

    const addressButton = $('<button>').addClass('btn btn-secondary btn-sm btn-mini').text('ERC20').css({'outline': 'none'});
    addressButton.click(() => {
      const copied = toClipboard(craftable.address);
      toastTokenAddressCopied(copied);
    });
    li.append(addressButton);

    const labelSpan = $('<span>');
    labelSpan.text(` ${craftable.name}: `).addClass('first-letter');
    li.append(labelSpan);

    const currentAmountSpan = $('<span>');
    const pendingAmountBadge = $('<span>').addClass('badge badge-secondary badge-pill');

    craftable.ui.updateAmount = (currentVal, pendingVal) => {
      currentAmountSpan.text(`${currentVal} `); // Spacing for the badge

      if (pendingVal > 0) {
        pendingAmountBadge.fadeIn(600).text(`(+ ${pendingVal} being crafted)`);
      } else {
        pendingAmountBadge.fadeOut(600);
      }
    };

    li.append(currentAmountSpan);
    li.append(pendingAmountBadge);

    list.append(li);
  });
  parent.append(list);
};

/*
 * Creates a set of buttons.
 * @param items An array of the craftables to be crafted with each button.
 * @param onclick A callback function to call with a craftable when its button
 * is clicked.
 * @param parent The HTML object the list of buttons is going to be appended to.
 * An enableCraft function is added to the UI property of each craftable, which
 * receives a boolean value indicating if it can be crafted or not, and updates
 * the DOM.
 * @returns An object mapping item names to a function that enables or disables
 * the associated button.
 */
exports.addCraftButtons = (craftables, onclick, parent) => {
  const listGroup = $('<div>').addClass('list-group align-items-center');
  craftables.forEach(craftable => {
    // The title of the button will reflect if transactions are pending
    const button = $(`<button type="button">Get ${craftable.name}</button>`);
    button.addClass('list-group-item').addClass('list-group-item-action d-flex justify-content-between align-items-center');

    craftable.ui.enableCraft = enabled => {
      button.prop('disabled', !enabled);
    };

    button.click(() => {
      button.blur(); // To prevent the button from remaining 'active'
      onclick(craftable);
    });

    listGroup.append(button);
  });

  parent.append(listGroup);
};

/*
 * Creates an HTML list showing recipe results and their ingredients.
 * @param recipes An array of recipes, consisting of results, ingredients, and
 * amounts.
 * @parent The HTML object the list of recipes is going to be appended to.
 */
exports.addIngredientsList = (recipes, parent) => {
  recipes.forEach(recipe => {
    const title = $(`<h6>${recipe.name}</h6>`).addClass('first-letter');
    const list = $('<ul class="list-group list-group-flush float-right" style="margin-bottom: 1rem"></ul>');
    recipe.ingredients.forEach(ingredient => {
      const li = $(`<li class="list-group-item list-group-item-secondary" style="width: 170px;">${ingredient.amount}x ${ingredient.name}</li>`);
      li.addClass('first-letter');
      list.append(li);
    });

    const col = $('<div>').addClass('col');
    col.append(title);
    col.append(list);

    const row = $('<div>').addClass('row');
    row.append(col);

    parent.append(row);
  });
};

/*
 * Sets the current Ethereum account number.
 */
exports.setAccount = (account) => {
  $('#user-account').text(account);
};

/*
 * Sets the current block. This function should be called every time a new
 * block is mined.
 */
exports.setBlock = (block) => {
  // On the first call, view.block has not been set yet
  if (typeof view.block === 'undefined') {
    // Periodically update the last block text (even if the block doesn't
    // change, the time since mining needs to be updated)
    setInterval(() => {
      $('#last-block').text(`#${view.block.number} (mined ${moment.unix(view.block.timestamp).fromNow()})`);
    }, 100);
  }

  view.block = block;
};

/*
 * Shows a MetaMask badge.
 */
exports.showMetaMaskBadge = () => {
  $('#using-metamask').css('display', 'inline');
};

/*
 * Sets the name of the current Ethereum network.
 */
exports.setEthnetName = (netName) => {
  $('#network').text(netName);
};

/*
 * Shows an unclosable modal dialog, used to display error messages.
 */
exports.showModalError = (content) => {
  $('#modal-body').empty();
  $('#modal-body').append($(content));
  $('#modal-dialog').modal('show');
};

/*
 * Hides the unclosable error modal dialog.
 */
exports.hideModalError = () => {
  $('#modal-dialog').modal('hide');
};

/*
 * Generates an address copied to clipboard toast.
 * @param copied The boolean result of the copy action.
 */
function toastTokenAddressCopied(copied) {
  if (copied) {
    toastr['info']('Token copied to clipboard', '' , {'positionClass': 'toast-bottom-center'});
  } else {
    toastr['warning']('Failed to copy token', '' , {'positionClass': 'toast-bottom-center'});
  }
}

/*
 * Generates a successful transaction toast.
 * @param tx The transaction hash.
 * @param url (optional) A link to where more information about the transaction
 * can be found.
 */
exports.toastSuccessfulTx = (tx, url) => {
  toastr['success'](tx, 'Successful transaction!', {onclick: () => {
    if (url) {
      window.open(url, '_blank');
    }
  }});
};

/*
 * Generates a failed to send transaction toast.
 */
exports.toastFailedToSendTx = () => {
  toastr['warning']('Failed to send a transaction');
};

/*
 * Generates a failed transaction toast.
 */
exports.toastErrorTx = () => {
  toastr['error']('Transaction failed');
};

toastr.options = {
  'positionClass': 'toast-bottom-right',
  'preventDuplicates': false,
  'showDuration': '300',
  'hideDuration': '1000',
  'timeOut': '5000',
  'extendedTimeOut': '1000',
  'showEasing': 'swing',
  'hideEasing': 'linear',
  'showMethod': 'fadeIn',
  'hideMethod': 'fadeOut'
};

// This causes moment to only show 'a few seconds ago' for the first
// 5 seconds after a timestamp.
moment.relativeTimeThreshold('ss', 5);

},{"copy-to-clipboard":5}],5:[function(require,module,exports){
'use strict';

var deselectCurrent = require('toggle-selection');

var defaultMessage = 'Copy to clipboard: #{key}, Enter';

function format(message) {
  var copyKey = (/mac os x/i.test(navigator.userAgent) ? '⌘' : 'Ctrl') + '+C';
  return message.replace(/#{\s*key\s*}/g, copyKey);
}

function copy(text, options) {
  var debug, message, reselectPrevious, range, selection, mark, success = false;
  if (!options) { options = {}; }
  debug = options.debug || false;
  try {
    reselectPrevious = deselectCurrent();

    range = document.createRange();
    selection = document.getSelection();

    mark = document.createElement('span');
    mark.textContent = text;
    // reset user styles for span element
    mark.style.all = 'unset';
    // prevents scrolling to the end of the page
    mark.style.position = 'fixed';
    mark.style.top = 0;
    mark.style.clip = 'rect(0, 0, 0, 0)';
    // used to preserve spaces and line breaks
    mark.style.whiteSpace = 'pre';
    // do not inherit user-select (it may be `none`)
    mark.style.webkitUserSelect = 'text';
    mark.style.MozUserSelect = 'text';
    mark.style.msUserSelect = 'text';
    mark.style.userSelect = 'text';

    document.body.appendChild(mark);

    range.selectNode(mark);
    selection.addRange(range);

    var successful = document.execCommand('copy');
    if (!successful) {
      throw new Error('copy command was unsuccessful');
    }
    success = true;
  } catch (err) {
    debug && console.error('unable to copy using execCommand: ', err);
    debug && console.warn('trying IE specific stuff');
    try {
      window.clipboardData.setData('text', text);
      success = true;
    } catch (err) {
      debug && console.error('unable to copy using clipboardData: ', err);
      debug && console.error('falling back to prompt');
      message = format('message' in options ? options.message : defaultMessage);
      window.prompt(message, text);
    }
  } finally {
    if (selection) {
      if (typeof selection.removeRange == 'function') {
        selection.removeRange(range);
      } else {
        selection.removeAllRanges();
      }
    }

    if (mark) {
      document.body.removeChild(mark);
    }
    reselectPrevious();
  }

  return success;
}

module.exports = copy;

},{"toggle-selection":6}],6:[function(require,module,exports){

module.exports = function () {
  var selection = document.getSelection();
  if (!selection.rangeCount) {
    return function () {};
  }
  var active = document.activeElement;

  var ranges = [];
  for (var i = 0; i < selection.rangeCount; i++) {
    ranges.push(selection.getRangeAt(i));
  }

  switch (active.tagName.toUpperCase()) { // .toUpperCase handles XHTML
    case 'INPUT':
    case 'TEXTAREA':
      active.blur();
      break;

    default:
      active = null;
      break;
  }

  selection.removeAllRanges();
  return function () {
    selection.type === 'Caret' &&
    selection.removeAllRanges();

    if (!selection.rangeCount) {
      ranges.forEach(function(range) {
        selection.addRange(range);
      });
    }

    active &&
    active.focus();
  };
};

},{}]},{},[1]);
