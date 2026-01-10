import express from 'express';
import bodyParser from 'body-parser';

/**
 * @title SupplierAgent
 * @notice An autonomous agent representing a Vendor.
 *         It listens for quote requests and negotiates.
 */
const app = express();
app.use(bodyParser.json());

const PORT = 4000;

// Hardcoded "Business Logic" - The Agent's Persona
const MIN_PRICE = 450;
const STANDARD_PRICE = 500;

app.post('/negotiate', (req, res) => {
    const { desiredPrice, item } = req.body;
    console.log(`🤖 Supplier Agent: Buyer wants '${item}' for ${desiredPrice} MNEE.`);

    // Agent Logic: "Hardball" but fair
    if (desiredPrice >= STANDARD_PRICE) {
        return res.json({
            status: "ACCEPTED",
            finalPrice: desiredPrice,
            message: "Deal accepted at list price."
        });
    }

    if (desiredPrice < MIN_PRICE) {
        return res.json({
            status: "REJECTED",
            finalPrice: STANDARD_PRICE,
            message: `Too low. My bottom line is ${MIN_PRICE}.`
        });
    }

    // Negotiate: Meet halfway
    const counterOffer = Math.floor((desiredPrice + STANDARD_PRICE) / 2);

    return res.json({
        status: "COUNTER_OFFER",
        finalPrice: counterOffer,
        message: `I can't do ${desiredPrice}, but I can do ${counterOffer} for a loyal customer.`
    });
});

app.listen(PORT, () => {
    console.log(`🏭 Supplier Agent online on port ${PORT}`);
});
