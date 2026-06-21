require('dotenv').config();
const promoCtrl = require('./controllers/promoCodeController');

(async ()=>{
  // helper req/res mocks
  const makeRes = ()=>{
    return {
      statusCode:200,
      jsonBody:null,
      status(code){this.statusCode=code; return this;},
      json(obj){ this.jsonBody=obj; console.log('RES', this.statusCode, JSON.stringify(obj,null,2)); return obj }
    }
  }

  try{
    console.log('\n--- Running cleanupExpiredPromoCodes (dry run) ---');
    await promoCtrl.cleanupExpiredPromoCodes({ body: { older_than_days: 0 } }, makeRes());

    console.log('\n--- Listing a few promo codes ---');
    const listingRes = makeRes();
    await promoCtrl.getPromoCodes({ query: { limit: 5, offset: 0 } }, listingRes);

    const data = listingRes.jsonBody?.data || [];
    if (data.length) {
      const id = data[0].promo_code_id;
      console.log('\n--- Testing updatePromoCodeStatus on id', id, '---');
      await promoCtrl.updatePromoCodeStatus({ params: { id }, body: { is_used: 0, used_by_user_id: null, used_by_phone: null, used_at: null, note: 'test-reset' } }, makeRes());
    }
  }catch(e){ console.error(e); process.exit(1);} finally{ process.exit(0);} })();
