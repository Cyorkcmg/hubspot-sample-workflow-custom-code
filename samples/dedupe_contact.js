// [CA-SECTION] Initialize HubSpot client
const DEDUPE_PROPERTY = 'phone'; // Primary field used to deduplicate contacts (before fallback)

const hubspot = require('@hubspot/api-client');

// [CA-NOTE] Main entry point for the HubSpot workflow extension
// Main workflow execution logic triggered by HubSpot workflow
exports.main = (event, callback) => {
  // Make sure to add your API key under "Secrets" above.
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.secretName
  });

  console.log('[CA] Dedupe workflow started for contact:', event.object.objectId);

  // [CA-SECTION] Retrieve contact details
  hubspotClient.crm.contacts.basicApi
    .getById(event.object.objectId, ['phone', 'mobilephone', 'address', 'city', 'state', 'zip'])
    .then(apiResponse => {
      const contactProperties = apiResponse?.properties;
      if (!contactProperties) {
        console.error('[CA] Could not retrieve contact properties');
        return;
      }
      console.log('[CA] Contact properties:', contactProperties);
      // [CA-SECTION] Normalize phone and address for deduplication
      let rawPhone = contactProperties['phone'] || contactProperties['mobilephone'] || "";ß
      if (contactProperties['phone']) {
        console.log('[CA] Using phone for deduplication');
      } else if (contactProperties['mobilephone']) {
        console.log('[CA] Using mobilephone for deduplication');
      }
      let digitsOnly = rawPhone.replace(/\D/g, '');
      // [CA-NOTE] Remove leading '1' from 11-digit US phone numbers to normalize to 10 digits.
      if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        digitsOnly = digitsOnly.substring(1);
      }
      console.log('[CA] Normalized phone value:', digitsOnly);

      let street = contactProperties['address'] || '';
      let city = contactProperties['city'] || '';
      let state = contactProperties['state'] || '';
      let zip = contactProperties['zip'] || '';

      // [CA-SECTION] Normalize address for fallback deduplication
      let rawAddress = `${street}, ${city}, ${state}, ${zip}`.toLowerCase().replace(/\s+/g, ' ').trim();
      let normalizedAddress = rawAddress
        .replace(/\bst\b/g, 'street')
        .replace(/\brd\b/g, 'road')
        .replace(/\bave\b/g, 'avenue')
        .replace(/[^a-z0-9]/g, '');
      console.log('[CA] Normalized address value:', normalizedAddress);

      // [CA-SECTION] Determine deduplication key (phone or address)
      // [CA-NOTE] Use phone if valid 10-digit; otherwise fallback to normalized address.
      let dedupePropValue;
      let dedupeField = DEDUPE_PROPERTY;

      if (digitsOnly.length === 10) {
        dedupePropValue = digitsOnly;
      } else if (normalizedAddress) {
        dedupeField = 'ca_normalized_address'; // Address fallback dedupe field
        dedupePropValue = normalizedAddress;
        console.log(`Falling back to dedupe based on address: ${dedupePropValue}`);
      } else {
        console.log('Neither phone nor address suitable for deduplication');
        return;
      }
      console.log('[CA] Final dedupe field:', dedupeField);
      console.log('[CA] Final dedupe value:', dedupePropValue);

      // [CA-SECTION] Search for duplicates and merge if found
      console.log(`Looking for duplicates based on ${dedupeField} = ${dedupePropValue}`);

      let searchFilters = [];

      if (dedupeField === 'phone') {
        searchFilters = [{
          filters: [
            {
              propertyName: 'phone',
              operator: 'EQ',
              value: dedupePropValue
            }
          ]
        }, {
          filters: [
            {
              propertyName: 'mobilephone',
              operator: 'EQ',
              value: dedupePropValue
            }
          ]
        }];
      } else {
        searchFilters = [{
          filters: [
            {
              propertyName: dedupeField,
              operator: 'EQ',
              value: dedupePropValue
            }
          ]
        }];
      }

      hubspotClient.crm.contacts.searchApi
        .doSearch({
          filterGroups: searchFilters
        })
        .then(searchResults => {
          let results = searchResults?.body?.results || [];
          console.log('[CA] Full search results:', JSON.stringify(results, null, 2));
          console.log('[CA] Number of results from search:', results.length);
          console.log('[CA] Returned contact IDs:', results.map(obj => obj.id));
          let idsToMerge = results
            .map(object => object.id)
            .filter(vid => Number(vid) !== Number(event.object.objectId));

          if (idsToMerge.length === 0) {
            console.log('No matching contact, nothing to merge');
            return;
          } else if (idsToMerge.length > 1) {
            console.log(`Found multiple potential contact IDs ${idsToMerge.join(', ')} to merge`);
            throw new Error("Ambiguous merge; more than one matching contact");
          }

          let idToMerge = idsToMerge[0];
          console.log(`Merging enrolled contact id=${event.object.objectId} into contact id=${idToMerge}`);

          hubspotClient
            .apiRequest({
              method: 'POST',
              path: `/contacts/v1/contact/merge-vids/${idToMerge}`,
              body: {
                vidToMerge: event.object.objectId
              }
            })
            .then(mergeResult => {
              console.log('[CA] Contacts merged!');
              callback({
                outputFields: {
                  status: 'Merge complete or skipped. See logs for details.'
                }
              });
            });
        }).catch(err => {
          console.error('[CA] Dedupe process failed:', err.message);
        });
    });
};
