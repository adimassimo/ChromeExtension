console.log('Content script loaded');

let isPageLoaded = false;
let inventoryData = [];
let startTime;
const token = new URLSearchParams(window.location.search).get('CSDegnerator');
function onPageLoad() {
    if (isPageLoaded) return;
    isPageLoaded = true;

    console.log('Page fully loaded');

    // Function to gather inventory history data
    function gatherInventoryData() {
        try {
            console.log('Gathering inventory data...');
            const rows = document.querySelectorAll('.tradehistoryrow'); // Adjust selector based on actual page structure
            console.log(`Found ${rows.length} rows`);
            rows.forEach(row => {
                const dateElement = row.querySelector('.tradehistory_date');
                const eventDescriptionElement = row.querySelector('.tradehistory_event_description');
                const itemGroups = row.querySelectorAll('.tradehistory_items_group');
                const plusMinusElements = row.querySelectorAll('.tradehistory_items_plusminus');

                if (dateElement && eventDescriptionElement && itemGroups.length > 0 && plusMinusElements.length > 0) {
                    const date = dateElement.innerText.trim();
                    const eventDescription = eventDescriptionElement.innerText.trim();
                    const datetime = `${date}`;

                    const items = [];
                    itemGroups.forEach((group, index) => {
                        const plusMinus = plusMinusElements[index] ? plusMinusElements[index].innerText.trim() : null;
                        const itemElements = group.querySelectorAll('.history_item_name');
                        itemElements.forEach(itemElement => {
                            const item = {
                                itemName: itemElement.innerText.trim(),
                                quantity: plusMinus
                            };
                            items.push(item);
                        });
                    });

                    const transaction = {
                        datetime: parseDateString(datetime.replace(/\n/g, ' ')),
                        eventDescription: eventDescription,
                        items: items
                    };

                    inventoryData.push(transaction);
                } else {
                    console.warn('Missing expected elements in row:', row);
                }
            });
        } catch (error) {
            console.error('Error gathering inventory data:', error);
        }
    }

    // Function to trim inventory data based on the last load time
    function trimInventoryData(inventoryData) {
        const lastLoadTime = new Date(localStorage.getItem('lastLoadTime'));
        console.log('Last load time:', lastLoadTime);
        var removeCount = 0;
        console.log('Inventory data:', inventoryData);
        for (let i = inventoryData.length - 1; i >= 0; i--) {
            const recordDate = new Date(inventoryData[i].datetime);
            console.log('Record date:', recordDate);
            console.log('Last load time:', lastLoadTime);
            if (recordDate < lastLoadTime) {
                removeCount++;
            } else {
                break;
            }
        }
        console.log('Removing last', removeCount, 'records');
        return inventoryData.splice(0, inventoryData.length - removeCount);
    }
    
    // Check if we have reached the most up-to-date transaction
    function checkIfUpToDate() {
        const LatestLoaded = getOldestTransactionDate();
        const localLastLoadTime = new Date(localStorage.getItem('lastLoadTime'));
        if (LatestLoaded < localLastLoadTime) {
            return true;
        }
        else {
            return false;
        }
    }
    

    // Function to handle the error popup
    function handleErrorPopup() {
        return new Promise((resolve) => {
            const errorPopup = document.querySelector('.newmodal .newmodal_close');
            if (errorPopup) {
                console.log('Error popup detected, waiting for 20 seconds...');
                updateStatus('Loading...');
                errorPopup.click();
                setTimeout(resolve, 20000); // Wait for 20 seconds
            } else {
                resolve();
            }
        });
    }

    // Function to load all rows by clicking the "Load more history" button until it disappears
    async function loadAllRows(maxClicks) {
        let clicks = 0;
        startTime = new Date();
        var end = checkIfUpToDate();
        while (!end) { // Adjust selector based on actual page structure
            var retries = 0;
            while (document.querySelector('#load_more_button').style.display === 'none' && retries < 20) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
                loadMoreButton = document.querySelector('#load_more_button');
                console.log('Waiting for "Load more history" button to appear...');
                retries++;
            }
            console.log(document.querySelector('#load_more_button').style.display);
            if (document.querySelector('#load_more_button').style.display === 'none') {
                break;
            }
            await handleErrorPopup();
            await clickLoadMoreButton();
            end = checkIfUpToDate();
            console.log(end);
            clicks++;
        }
        gatherInventoryData();
        saveData(clicks);
        hideloader();
        updateStatus('');
        applyFilters(); // Apply filters to newly loaded rows
    }
    // Function to click the "Load more history" button
    function clickLoadMoreButton() {
        return new Promise((resolve) => {
            let loadMoreButton = document.querySelector('#load_more_button'); // Adjust selector based on actual page structure
            if (loadMoreButton) {
                loadMoreButton.click();
                updateLoader();
                //console.log(getOldestTransactionDate());
                console.log('Clicked "Load more history" button');
                updateStatus('Loading...');
                setTimeout(() => {
                    applyFilters(); // Apply filters to newly loaded rows
                    resolve();
                }, 750); // Wait for .75 seconds to allow new rows to load
            } else {
                resolve();
            }
        });
    }
    // Function to extract Steam name from URL
    function getSteamNameFromURL() {
        const url = window.location.href;
        const match = url.match(/https:\/\/steamcommunity\.com\/id\/([^\/]+)\/inventoryhistory/);
        return match ? match[1] : 'Unknown';
    }

    // Function to save data to local storage and send to API
    async function saveData(pagesLoaded) {
        try {
            const trimmedData = trimInventoryData(inventoryData);
            const currentRun = {
                timestamp: new Date(),
                pagesLoaded: pagesLoaded,
                totalRows: trimmedData.length,
            };
            localStorage.setItem('lastLoadTime', new Date());
            console.log('Data saved to local storage.');
            updateLastFullRun();

            // Split trimmedData into chunks of 1000 records
            const chunkSize = 1000;
            const dataChunks = [];
            for (let i = 0; i < trimmedData.length; i += chunkSize) {
                dataChunks.push(trimmedData.slice(i, i + chunkSize));
            }

            // Send each chunk to the API
            //LOCALLY replace https://csdegenerator-976197890228.us-central1.run.app/ with http://127.0.0.1:8080/ for testing
            for (const chunk of dataChunks) {
                const response = await fetch('https://csdegenerator-976197890228.us-central1.run.app/api/inventory', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ ...currentRun, data: chunk })
                });
                const result = await response.json();
                console.log('Data chunk sent to API:', result);
            }
        } catch (error) {
            console.error('Error saving data to local storage or sending to API:', error);
        }
    }

    // Function to update the status message
    function updateStatus(message) {
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.innerText = message;
        }
    }

    // Function to update the elapsed time
    function updateLoader() {
        const loaderElement = document.getElementById('loader');
        if (loaderElement) {
            if (loaderElement.innerText == ''){
                loaderElement.innerText = '|';
            }
            else if (loaderElement.innerText == '|'){
                    loaderElement.innerText = '/';
            }
            else if (loaderElement.innerText == '/'){
                loaderElement.innerText = '-';
            }
            else if (loaderElement.innerText == '-'){
                loaderElement.innerText = '\\';
            }
            else if (loaderElement.innerText == '\\'){
                loaderElement.innerText = '|';
            }
        }
    }
    function hideloader() {
        const loaderElement = document.getElementById('loader');
        loaderElement.innerText = '';
    }

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'clearLocalStorage') {
            clearlocalstorage()
        }
    });

    function clearlocalstorage() {
        localStorage.clear();
        console.log('Local storage cleared.');
    }
    function parseDateString(dateString) {
        const dateTimeParts = dateString.split(' ');
        if (dateTimeParts.length !== 4) {
            throw new Error(`Invalid date string format: ${dateString}`);
        }
    
        const [month, day, year, timePart] = dateTimeParts;
        const timeMatch = timePart.match(/(\d{1,2}:\d{2})([ap]m)/i);
    
        if (!timeMatch) {
            throw new Error(`Invalid time format in date string: ${dateString}`);
        }
    
        const [time, period] = timeMatch.slice(1, 3);
    
        const months = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
    
        let [hours, minutes] = time.split(':').map(Number);
        if (period.toLowerCase() === 'pm' && hours !== 12) {
            hours += 12;
        } else if (period.toLowerCase() === 'am' && hours === 12) {
            hours = 0;
        }
    
        return new Date(year, months[month], parseInt(day), hours, minutes);
    }
    // Function to get the date of the 1st transaction
    function getNewestTransactionDate() {
        const TransactionElement = document.getElementById('inventory_history_table').firstElementChild;
        const TransactionDateElement = TransactionElement.querySelector('.tradehistory_date');
        const TransactionDate = TransactionDateElement.innerText.trim().replace(/\n/g, ' ');
        const TransactionDateFormatted = parseDateString(TransactionDate);
        return TransactionDateFormatted;
    }
    function getOldestTransactionDate() {
        const TransactionElement = document.getElementById('inventory_history_table').lastElementChild;
        const TransactionDateElement = TransactionElement.querySelector('.tradehistory_date');
        const TransactionDate = TransactionDateElement.innerText.trim().replace(/\n/g, ' ');
        const TransactionDateFormatted = parseDateString(TransactionDate);
        return TransactionDateFormatted;
    }

    // Function to update the last full run
    function updateLastFullRun() {
        const startScrapeButton = document.getElementById('startScrapeButton');
        const lastFullRunElement = document.getElementById('lastFullRun');
        const lastLoadTime = new Date(localStorage.getItem('lastLoadTime'));
        const lastTransactionDateFormatted = getNewestTransactionDate();
        console.log(getNewestTransactionDate());
        console.log(getOldestTransactionDate());
        if (lastLoadTime < new Date('Wed Dec 31 2000 19:00:00 GMT-0500 (Eastern Standard Time)')) {
            lastFullRunElement.innerText = '';
        }
        else if (lastLoadTime > lastTransactionDateFormatted) {
            lastFullRunElement.innerText = `CS Degenerator Data Up To Date`;
            startScrapeButton.hidden = true;
        } else {
            lastFullRunElement.innerText = `Last Loaded: ${lastLoadTime}`;
        }
    }

    // Function to compare local data with database data
    function checkLastRun() {
        const localLastLoadTime = new Date(localStorage.getItem('lastLoadTime'));
        const steamName = getSteamNameFromURL();
    
        const xhr = new XMLHttpRequest();
        //LOCALLY replace https://csdegenerator-976197890228.us-central1.run.app with http://127.0.0.1:8080 for testing
        xhr.open('GET', `https://csdegenerator-976197890228.us-central1.run.app/api/inventory/latest`, false); // false for synchronous request
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(null);
    
        if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
    
            if (result.success) {
                const dbLastLoadTime = new Date(result.latestDate);
                // TEST 1 Set == one to not use database value for testing
                if (localLastLoadTime.getTime() !== dbLastLoadTime.getTime()) {
                    console.log('Updating local last load time to match database.');
                    localStorage.setItem('lastLoadTime', dbLastLoadTime);
                } else {
                    console.log('Local last load time is up to date.');
                }
            } else {
                console.error('Failed to fetch the latest inventory date from the database:', result.error);
            }
        } else {
            console.error('Error while fetching the latest inventory date:', xhr.statusText);
        }
    }
    // Function to inject the control panel into the page
    function injectControlPanel() {
        try {
            console.log('Injecting control panel...');
            const controlPanel = document.createElement('div');
            controlPanel.style.minHeight = '30px';
            controlPanel.style.lineHeight = '30px';
            controlPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            controlPanel.style.color = '#959595';
            controlPanel.style.padding = '0px 8px';
            controlPanel.style.fontSize = '12px';
            controlPanel.style.marginBottom = '3px';
            controlPanel.style.width = '100%';
            controlPanel.style.textAlign = 'left';
    
            const token = new URLSearchParams(window.location.search).get('CSDegnerator');
            let buttonHTML;
            if (token) {
                buttonHTML = `<button id="startScrapeButton" style="margin-right: 10px;">Reload Trade Data</button>`;
            } else {
                //LOCALLY replace https://csdegenerator.com/ with http://localhost:63908/ for testing
                buttonHTML = `<button id="loginButton" style="margin-right: 10px;" onclick="window.location.href='https://csdegenerator.com/'">Login to use CSDegenerator</button>`;
            }
    
            controlPanel.innerHTML = `
                <div style="display: flex; align-items: center;">
                    ${buttonHTML}
                    <div id="lastFullRun" style="margin-right: 10px;"></div>
                    <div id="statusMessage" style="margin-right: 10px;"></div>
                    <div id="loader" style="margin-right: 10px;"></div>
                    <label for="loadMoreCount" style="margin-right: 5px; display: none;">Number of pages to load (0 for all): </label>
                    <input type="number" id="loadMoreCount" value="0" min="0" style="width: 50px; display: none;">
                </div>
            `;
    
            // Find the target element to insert the control panel above
            const targetElement = document.querySelector('.inventory_history_pagingrow');
            if (targetElement) {
                targetElement.parentNode.insertBefore(controlPanel, targetElement);
                console.log('Control panel injected above the target element.');
            } else {
                console.error('Target element not found.');
            }
    
            if (token) {
                document.getElementById('startScrapeButton').addEventListener('click', () => {
                    checkLastRun();
                    updateLastFullRun();
                    if (document.getElementById('startScrapeButton').hidden == false) { 
                        document.getElementById('startScrapeButton').hidden = true;  
                        const loadMoreCount = parseInt(document.getElementById('loadMoreCount').value, 10);
                        loadAllRows(loadMoreCount);
                    }
                });
            }
    
            const loadMoreButton = document.querySelector('#load_more_button');
            if (loadMoreButton) {
                loadMoreButton.addEventListener('click', () => {
                    setTimeout(applyFilters, 750); // Wait for .75 seconds to allow new rows to load
                });
            }
            if (token) {
            updateLastFullRun();
            }
        } catch (error) {
            console.error('Error injecting control panel:', error);
        }
    }
    // Function to inject additional into the page
    function injectFilters() {
        try {
            console.log('Injecting filters...');
            const filters = document.createElement('div');
            filters.style.minHeight = '30px';
            filters.style.lineHeight = '30px';
            filters.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            filters.style.color = '#959595';
            filters.style.padding = '0px 8px';
            filters.style.fontSize = '12px';
            filters.style.marginBottom = '3px';
            filters.style.width = '100%';
            filters.style.textAlign = 'left';
    
            filters.innerHTML = `
                <div>
                    <label>Filter results by item type:</label>
                    <label><input type="checkbox" id="filterCases"> Cases</label>
                    <label><input type="checkbox" id="filterStickers"> Stickers</label>
                    <label><input type="checkbox" id="filterSouvenirs"> Souvenirs</label>
                </div>
            `;
            // Find the target element to insert the control panel above
            const targetElement = document.getElementById('inventory_history_table');
            if (targetElement) {
                targetElement.parentNode.insertBefore(filters, targetElement);
                console.log('Filters injected above the target element.');
            } else {
                console.error('Target element not found.');
            }

            document.getElementById('filterCases').addEventListener('change', applyFilters);
            document.getElementById('filterStickers').addEventListener('change', applyFilters);
            document.getElementById('filterSouvenirs').addEventListener('change', applyFilters);

        } catch (error) {
            console.error('Error injecting filters:', error);
        }
    }
    // Function to apply filters based on checkboxes
    function applyFilters() {
        //TEST 1
        //localStorage.setItem('lastLoadTime', new Date('Thu Dec 19 2024 19:00:00 GMT-0500 (Eastern Standard Time)'));
        //clearlocalstorage();
        const filterCases = document.getElementById('filterCases').checked;
        const filterStickers = document.getElementById('filterStickers').checked;
        const filterSouvenirs = document.getElementById('filterSouvenirs').checked;
        const rows = document.querySelectorAll('.tradehistoryrow');
        rows.forEach(row => {
            const eventDescription = row.querySelector('.tradehistory_event_description').innerText.trim();
            const items = Array.from(row.querySelectorAll('.history_item_name')).map(item => item.innerText.trim().toLowerCase());

            let showRow = eventDescription === 'Unlocked a container';

            if (showRow && filterCases && items.some(item => item.includes('case') && !item.includes('key'))) {
                showRow = true;
            } else if (showRow && filterStickers && items.some(item => item.includes('sticker'))) {
                showRow = true;
            } else if (showRow && filterSouvenirs && items.some(item => item.includes('souvenir'))) {
                showRow = true;
            } else if (!filterCases && !filterStickers && !filterSouvenirs) {
                showRow = true;
            } else {
                showRow = false;
            }

            row.style.display = showRow ? 'block' : 'none';
        });
    }

    // Inject the control panel when the content script is loaded
    injectControlPanel();
    injectFilters();
}

// Use window.onload to ensure the script runs after the page has fully loaded
window.onload = onPageLoad;

// Use MutationObserver to detect changes in the DOM and run the script
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && document.readyState === 'complete') {
            onPageLoad();
            observer.disconnect();
        }
    });
});

observer.observe(document, { childList: true, subtree: true });