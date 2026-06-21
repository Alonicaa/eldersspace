const http = require('http');

http.get('http://localhost:3000/api/redemptions', (res) => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('✓ API Response - Type:', Array.isArray(json) ? 'Array' : typeof json);
      
      if (Array.isArray(json)) {
        console.log('Total records:', json.length);
        if (json.length > 0) {
          console.log('\nLatest 3 records:');
          json.slice(-3).forEach((rec, i) => {
            console.log(`\n${i+1}. ID: ${rec.redemption_id}`);
            console.log(`   User: ${rec.user_name} (${rec.phone_number})`);
            console.log(`   Reward: ${rec.reward_name}`);
            console.log(`   Points: ${rec.points_redeemed}`);
            console.log(`   QR: ${rec.qr_code || 'NULL'}`);
            console.log(`   Status: ${rec.redemption_status}`);
            console.log(`   Date: ${rec.redeemed_at}`);
          });
        }
      } else if (json.data) {
        console.log('Total records:', json.data.length);
        if (json.data.length > 0) {
          const latest = json.data[json.data.length - 1];
          console.log('\nLatest record:');
          console.log('  ID:', latest.redemption_id);
          console.log('  User:', latest.user_name);
          console.log('  QR:', latest.qr_code);
        }
      }
      
      process.exit(0);
    } catch (e) {
      console.log('ERROR:', e.message);
      console.log('Response:', data.slice(0, 200));
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.log('Connection ERROR:', e.message);
  process.exit(1);
});
