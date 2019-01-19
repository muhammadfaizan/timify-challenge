const { Room, Doctor, Consultation } = require('../db/index');
const debug = require('debug')('timify:controllers:consultations')
const moment = require('moment');
const v = require('../services/index').validator;
const { TIME_FORMAT, DATE_FORMAT, DATE_TIME_FORMAT } = require('../services').constants;

const cvrtMoment2Index = (momentIndex) => (momentIndex) % 7;
const findMiddleTime = (referenceTime, subjectTime) => {
    // case 1: subject begin time is in interval of reference time
    // case 2: subject end time is in interval of reference time
    // case 3: subject time overlaps from outer bounds to reference time
    // case 4: subject is limited to reference time
    // case 5: subject time lies on reference time
    // case 6: subject time never overlaps reference time


    if (referenceTime.begin === subjectTime.begin) {
        if (referenceTime.end === subjectTime.end ||
            ((referenceTime.begin < subjectTime.end) && (referenceTime.end > subjectTime.end))) {
            return Object.assign({}, referenceTime);
        } else if (referenceTime.end > subjectTime.end) {
            return {
                begin: referenceTime.begin,
                end: subjectTime.end
            }
        }
    } else if (referenceTime.begin > subjectTime.begin) {
        if (referenceTime.end === subjectTime.end || referenceTime.end < subjectTime.end) {
            return Object.assign({}, referenceTime);
        } else if (referenceTime.end > subjectTime.end) {
            return {
                begin: referenceTime.begin,
                end: subjectTime.end
            }
        }
    }


}
const findAvailability = async (req, res, next) => {
    try {
        const validator = v.object({
            begin: v.dateString,
            end: v.dateString,
            duration: v.numeric
        });

        debug(req.query);
        validator(req.query);
        let payload = req.query;
        let mStartDate = moment(payload.begin, DATE_FORMAT)
        let mEndDate = moment(payload.end, DATE_FORMAT)
        if (mStartDate > mEndDate) {
            throw new Error('"begin" date must be earlier date than "end" date')
        }
        let weekDays = [];
        let daysCount = mEndDate.diff(mStartDate);
        for (let i = 0, iterativeDate = mStartDate.clone();
            i < 7 && iterativeDate < mEndDate;
            i++) {
            weekDays.push(cvrtMoment2Index(iterativeDate.weekday()))
            iterativeDate.add(1, 'day');
        }
        /* 
         To check null value
         { $type: 10 }
        */
        let query = { $or: [] }
        // all the weekdays found
        // now mapping it to query
        // by $or
        query.$or = weekDays.map(wd => {
            let key = `times.${wd}`;
            let q = {};
            q[key] = { $ne: { $type: 10 } }
            return q;
        })

        let availableRooms = await Room.find(query);
        let availableDoctors = await Doctor.find(query);
        availableDoctors = availableDoctors.map(obj => obj.toObject())
        availableRooms = availableRooms.map(o => o.toObject());
        let setAvailableTime = (docSet) => {
            return docSet.map(doc => {
                if (!doc.avbTimes) {
                    doc.avbTimes = [];
                }
                let docItrtvDate = mStartDate.clone();
                // iterating over days to create exact same days for each day in interval
                while (docItrtvDate < mEndDate) {

                    let dayIndex = cvrtMoment2Index(docItrtvDate.weekday());

                    if (!doc.times[dayIndex]) {
                        doc.avbTimes.push(null);
                    } else {
                        doc.avbTimes.push({
                            begin: moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].begin}`, DATE_TIME_FORMAT).toDate(),
                            end: moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].end}`, DATE_TIME_FORMAT).toDate()
                        })
                    }
                    docItrtvDate.add(1, 'day');
                }
                return doc;
            });
        }
        availableDoctors = setAvailableTime(availableDoctors);
        availableRooms = setAvailableTime(availableRooms);
        let doctorAndRoomTimes = availableRooms.reduce((room) => {
            return availableDoctors.map(doctor => {
                let DnR = {
                    room: room._id,
                    doctor: doctor._id,
                    times: []
                };
                doctor.avbTimes.forEach(time => {

                })
                return DnR;
            })
        }, [])

        // once data is ready and has all available time listed for doctor and room.
        // check for consultations on that day and modify that day room accordingly.
        res.send({
            availableRooms,
            availableDoctors
        });
    } catch (err) {
        next(err);
    }

}
const createConsultation = async (req, res, next) => { }
const getAllConsultations = async (req, res, next) => { }

module.exports = {
    findAvailability,
    createConsultation,
    getAllConsultations
}