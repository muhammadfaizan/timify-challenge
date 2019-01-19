const { Room, Doctor, db } = require('../db/index');
const debug = require('debug')('timify:controllers:resources')
const { ObjectID } = require('mongodb')
const v = require('../services/index').validator;
const createAndUpdateResources = async (req, res, next) => {

    const updateAllCollection = async (model, docs) => {
        await model.collection.remove();
        const bulk = model.collection.initializeUnorderedBulkOp();

        docs.forEach((doc) => {
            doc._id = ObjectID(doc._id)
            bulk.insert(doc)
        });
        return bulk.execute();
    }
    try {
        let roomAndDoctorValidator = v.array(v.object({
            _id: v.mongoId,
            name: v.string,
            times: v.compose([
                v.length(7),
                v.array(
                    v.optional(
                        v.object({
                            begin: v.timeString,
                            end: v.timeString
                        })
                    )
                )
            ])
        }))
        let validator = v.object({
            rooms: roomAndDoctorValidator,
            doctors: roomAndDoctorValidator
        })
        validator(req.body);
        await db.db.dropDatabase();
        let roomsData = await Promise.all([
            updateAllCollection(Room,req.body.rooms),
            updateAllCollection(Doctor, req.body.doctors)
        ]);
        
        res.send({
            success: true
        });
    }
    catch (err) {
        next(err);
    }
}

const getResources = (req, res, next) => {

}

module.exports = {
    createAndUpdateResources,
    getResources
}