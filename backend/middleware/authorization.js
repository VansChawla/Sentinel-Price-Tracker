const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = async(req, res, next) => {
    try {
        const jwtToken = req.header("token");

        if(!jwtToken) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const payload = jwt.verify(jwtToken, process.env.JWT_SECRET);
        req.user = payload.user_id;
        next();
    } catch (error) {
        console.error(error);
        res.status(403).json({ message: "Not authorized" });
    }
};