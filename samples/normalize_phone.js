/****
 * This script normalizes the contact's phone number or mobile phone number
 * into a 10-digit format and saves it to a custom property called 'normalized_phone'.
 */

exports.main = async (event, callback) => {
  const contactId = event.inputFields['hs_object_id'];
  
  const normalizePhone = (input) => {
    if (!input) return '';
    // Remove all non-digit characters
    const digits = input.replace(/\D/g, '');
    // Remove country code if present (e.g., +1)
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.substring(1);
    }
    return digits;
  };

  const rawPhone = event.inputFields['phone'] || '';
  const rawMobile = event.inputFields['mobilephone'] || '';

  const normPhone = normalizePhone(rawPhone);
  const normMobile = normalizePhone(rawMobile);

  let normalized = '';

  if (normPhone.length === 10) {
    normalized = normPhone;
  } else if (normMobile.length === 10) {
    normalized = normMobile;
  } else {
    normalized = normPhone || normMobile;
  }

  console.log(`[PhoneNormalizer] Contact ID: ${contactId}, Raw Phone: ${rawPhone}, Raw Mobile: ${rawMobile}, Normalized: ${normalized}`);

  callback({
    outputFields: {
      normalized_phone: normalized
    }
  });
};