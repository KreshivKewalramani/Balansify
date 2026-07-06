import { createClient } from '@insforge/sdk';
const client = createClient({ baseUrl: 'https://test.insforge.app', anonKey: 'test' });
console.log('AI.chat keys:', Object.keys(client.ai.chat || {}));
function getAllPropertyNames(obj) {
  let props = [];
  let currentObj = obj;
  while (currentObj && currentObj !== Object.prototype) {
    Object.getOwnPropertyNames(currentObj).forEach(function (prop) {
      if (props.indexOf(prop) === -1) {
        props.push(prop);
      }
    });
    currentObj = Object.getPrototypeOf(currentObj);
  }
  return props;
}
console.log('AI.chat Methods:', getAllPropertyNames(client.ai.chat).filter(name => typeof client.ai.chat[name] === 'function'));
if (client.ai.chat.completions) {
  console.log('AI.chat.completions keys:', Object.keys(client.ai.chat.completions));
  console.log('AI.chat.completions Methods:', getAllPropertyNames(client.ai.chat.completions).filter(name => typeof client.ai.chat.completions[name] === 'function'));
}
