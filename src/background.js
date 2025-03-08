// This file contains the background script for the Chrome extension. 
// It manages events and handles communication between different parts of the extension.

chrome.runtime.onInstalled.addListener(() => {
    console.log("Steam Inventory Extension installed.");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchInventoryData") {
        // Logic to fetch inventory data can be added here
        sendResponse({ data: "Inventory data fetched." });
    }
});