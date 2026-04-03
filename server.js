const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get('/', (req, res) => {
    res.json({ status: 'Bot is running!' });
});

app.get('/privacy', (req, res) => {
    res.send('<h1>Privacy Policy</h1><p>This bot collects messages to provide automated replies. We do not store or share your data.</p>');
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log('Event:', JSON.stringify(body).substring(0, 500));

    try {
        if (body.object === 'page') {
            for (const entry of body.entry) {
                // Facebook Messages
                if (entry.messaging) {
                    for (const event of entry.messaging) {
                        if (event.message && !event.message.is_echo) {
                            await handleMessage(event);
                        }
                        if (event.postback) {
                            await handlePostback(event);
                        }
                    }
                }
                // Facebook Comments
                if (entry.changes) {
                    for (const change of entry.changes) {
                        if (change.field === 'feed' && change.value.item === 'comment') {
                            await handlePageComment(change.value);
                        }
                    }
                }
            }
        }

        // Instagram Events
        if (body.object === 'instagram') {
            for (const entry of body.entry) {
                // Instagram DM Messages
                if (entry.messaging) {
                    for (const event of entry.messaging) {
                        if (event.message && !event.message.is_echo) {
                            await handleInstagramMessage(event);
                        }
                    }
                }
                // Instagram Comments
                if (entry.changes) {
                    for (const change of entry.changes) {
                        if (change.field === 'comments') {
                            await handleInstagramComment(change.value);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
    res.status(200).send('EVENT_RECEIVED');
});

// ============ Facebook Messenger ============
async function handleMessage(event) {
    const senderId = event.sender.id;
    const text = event.message.text || '';
    console.log('FB Message: ' + text);
    const reply = generateReply(text);
    await sendMessage(senderId, reply);
}

async function handlePageComment(value) {
    const commentId = value.comment_id;
    const message = value.message || '';
    const senderName = value.from ? value.from.name : '';
    const senderId = value.from ? value.from.id : '';
    const postId = value.post_id || '';
    const pageId = postId.split('_')[0];
    if (senderId === pageId) return;
    if (value.parent_id) return;
    console.log('FB Comment: ' + message);
    const reply = generateReply(message);
    await replyToComment(commentId, senderName + ' ' + reply);
    try {
        await sendPrivateReply(commentId, senderName + ' ' + reply);
    } catch (e) {}
}

async function handlePostback(event) {
    const senderId = event.sender.id;
    const payload = event.postback.payload;
    var reply = 'ازاي اقدر اساعدك؟';
    if (payload === 'GET_STARTED') {
        reply = 'اهلا بيك! ازاي اقدر اساعدك؟';
    }
    await sendMessage(senderId, reply);
}

// ============ Instagram DM ============
async function handleInstagramMessage(event) {
    const senderId = event.sender.id;
    const text = event.message.text || '';
    console.log('IG Message: ' + text);
    const reply = generateReply(text);
    await sendInstagramMessage(senderId, reply);
}

// ============ Instagram Comments ============
async function handleInstagramComment(value) {
    var commentId = value.id;
    var message = value.text || '';
    var mediaId = value.media ? value.media.id : '';
    console.log('IG Comment: ' + message);

    // متردش على ردود (replies)
    if (value.parent_id) return;

    var reply = generateReply(message);
    await replyToInstagramComment(commentId, reply);
}

// ============ Smart Reply ============
function generateReply(message) {
    if (!message) return 'اهلا بيك! ازاي اقدر اساعدك؟';
    var msg = message.toLowerCase().trim();
    if (['هلا','مرحبا','السلام','اهلا','هاي','hi','hello','ازيك','صباح','مساء'].some(function(k){return msg.includes(k);})) {
        return 'اهلا وسهلا بيك! ازاي اقدر اساعدك؟';
    }
    if (['سعر','اسعار','كام','بكام','price','تكلفة'].some(function(k){return msg.includes(k);})) {
        return 'اسعارنا بتبدا من XXX جنيه. عايز تفاصيل اكتر؟';
    }
    if (['توصيل','شحن','delivery','shipping'].some(function(k){return msg.includes(k);})) {
        return 'بنوصل لكل المحافظات! التوصيل من 2-5 ايام.';
    }
    if (['طلب','اطلب','عايز','order','اشتري'].some(function(k){return msg.includes(k);})) {
        return 'ابعتلي:\n1- اسم المنتج\n2- الكمية\n3- اسمك\n4- العنوان\n5- رقم الموبايل';
    }
    if (['شكرا','thanks','متشكر','تسلم'].some(function(k){return msg.includes(k);})) {
        return 'العفو! لو محتاج حاجة تاني احنا موجودين!';
    }
    if (['رقم','تليفون','موبايل','phone','واتساب'].some(function(k){return msg.includes(k);})) {
        return 'ارقامنا:\nموبايل: 01XXXXXXXXX\nواتساب: 01XXXXXXXXX';
    }
    return 'شكرا لرسالتك! هيتم الرد عليك في اقرب وقت.\nللمساعدة: 01XXXXXXXXX';
}

// ============ Send Functions ============
async function sendMessage(recipientId, text) {
    try {
        await axios.post('https://graph.facebook.com/v18.0/me/messages', {
            recipient: { id: recipientId },
            message: { text: text },
            messaging_type: 'RESPONSE'
        }, { params: { access_token: PAGE_ACCESS_TOKEN } });
        console.log('FB Message sent!');
    } catch (error) {
        console.error('FB Send error:', error.response ? error.response.data : error.message);
    }
}

async function sendInstagramMessage(recipientId, text) {
    try {
        await axios.post('https://graph.facebook.com/v18.0/me/messages', {
            recipient: { id: recipientId },
            message: { text: text },
            messaging_type: 'RESPONSE'
        }, { params: { access_token: PAGE_ACCESS_TOKEN } });
        console.log('IG Message sent!');
    } catch (error) {
        console.error('IG Send error:', error.response ? error.response.data : error.message);
    }
}

async function replyToComment(commentId, message) {
    try {
        await axios.post('https://graph.facebook.com/v18.0/' + commentId + '/comments', {
            message: message
        }, { params: { access_token: PAGE_ACCESS_TOKEN } });
        console.log('FB Comment reply sent!');
    } catch (error) {
        console.error('FB Comment error:', error.response ? error.response.data : error.message);
    }
}

async function replyToInstagramComment(commentId, message) {
    try {
        await axios.post('https://graph.facebook.com/v18.0/' + commentId + '/replies', {
            message: message
        }, { params: { access_token: PAGE_ACCESS_TOKEN } });
        console.log('IG Comment reply sent!');
    } catch (error) {
        console.error('IG Comment error:', error.response ? error.response.data : error.message);
    }
}

async function sendPrivateReply(commentId, message) {
    await axios.post('https://graph.facebook.com/v18.0/me/messages', {
        recipient: { comment_id: commentId },
        message: { text: message },
        messaging_type: 'RESPONSE'
    }, { params: { access_token: PAGE_ACCESS_TOKEN } });
}

// Keep Alive
var SELF_URL = 'https://nervous-annis-fashionistaaccessories-4f8d521e.koyeb.app/';
setInterval(function() {
    axios.get(SELF_URL)
        .then(function() { console.log('Keep alive ping'); })
        .catch(function() {});
}, 280000);

var PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', function() {
    console.log('Bot running on port ' + PORT);
});
