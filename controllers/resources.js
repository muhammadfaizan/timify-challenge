const { Room, Doctor, Consultation, db } = require('../db/index');
const debug = require('debug')('timify:controllers:resources')
const { ObjectID } = require('mongodb')
const v = require('../services/index').validator;
const createAndUpdateResources = async (req, res, next) => {

    const updateAllCollection = async (model, docs) => {
        await model.collection.remove();
        const bulk = model.collection.initializeUnorderedBulkOp();

        docs.forEach((doc) => {
            bulk.insert(doc)
        });
        return bulk.execute();
    }
    try {
        let roomAndDoctorValidator = v.array(v.object({
            id: v.string,
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
        await Consultation.remove({});
        await Room.remove({});
        await Doctor.remove({});
        await updateAllCollection(Room, req.body.rooms);
        await updateAllCollection(Doctor, req.body.doctors)

        res.send({
            success: true
        });
    }
    catch (err) {
        next(err);
    }
}

const getResources = async (req, res, next) => {

    try {
        // I first combined them both in promise.all
        // but later figured that it was making the request slower
        // so I separated them and now this is improved by 80%
        let rooms = await Room.find({});
        let doctors = await Doctor.find({});
        res.send({
            rooms,
            doctors
        });
    } catch (err) {
        next(err);
    }

}

module.exports = {
    createAndUpdateResources,
    getResources
}