document.addEventListener('DOMContentLoaded', function() {
    const inventoryDataContainer = document.getElementById('inventory-data');
    const fetchButton = document.getElementById('fetch-data');
    const refreshButton = document.getElementById('refresh-button');

    refreshButton.addEventListener('click', function() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'clearLocalStorage' });
        });
        console.log('Request to clear local storage sent.');
    });

    function displayInventoryData(data) {
        inventoryDataContainer.innerHTML = '';
        data.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.textContent = `${item.name} - ${item.date}`;
            inventoryDataContainer.appendChild(itemElement);
        });
    }
});