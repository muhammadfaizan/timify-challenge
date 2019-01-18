const { Room, Doctor, db } = require('../db/index');
const debug = require('debug')('timify:controllers:resources')
const { ObjectID } = require('mongodb')
const v = require('../services/index').validator;
const createAndUpdateResources = async (req, res, next) => {
    
    const updateAllCollection = (model, docs) => {
        const bulk = model.collection.initializeUnorderedBulkOp();
        return Promise.all(docs.map(doc => {
            let { id, ...updateDoc} = doc;
            return bulk.find({ 
                _id: ObjectID(id)
            })
            .upsert()
            .replaceOne(updateDoc);
        }))
        .then(() => new Promise((resolve, reject) => {
                bulk.execute((err, result) => {
                  if (err) reject(err)
                  else resolve(result)
                });
            })
        )
    }
    try {
        let validator = v.object({
            rooms: v.array(v.object({
                id: v.mongoId,
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
            })),
            doctors: v.array(v.object({
                id: v.mongoId,
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
        })
        validator(req.body);
        let roomsData = await Promise.all([
            updateAllCollection(Room,req.body.rooms),
            updateAllCollection(Doctor, req.body.doctors)
        ]);
        
        res.send(roomsData);
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