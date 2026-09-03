const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

/* =========================================================
   عند إنشاء طلب هدية جديد
   المسار:
   users/{userId}/basket/{orderId}
========================================================= */

exports.notifyServantsWhenGiftRequested = onDocumentCreated(
  "users/{userId}/basket/{orderId}",

  async (event) => {
    try {
      /* =====================================================
         التأكد من وجود الطلب
      ===================================================== */

      const snapshot = event.data;

      if (!snapshot) {
        console.log("❌ لا توجد بيانات للطلب");
        return;
      }

      const order = snapshot.data();

      const userId = event.params.userId;
      const orderId = event.params.orderId;

      console.log("🎁 طلب هدية جديد");
      console.log("User ID:", userId);
      console.log("Order ID:", orderId);


      /* =====================================================
         بيانات المخدوم
      ===================================================== */

      const userSnap = await db
        .collection("users")
        .doc(userId)
        .get();

      if (!userSnap.exists) {
        console.log("❌ المخدوم غير موجود:", userId);
        return;
      }

      const user = userSnap.data();


      /* =====================================================
         اسم المخدوم
      ===================================================== */

      const servantName =
        user.fullName ||
        user.username ||
        user.name ||
        "مخدوم";


      /* =====================================================
         بيانات الهدية
      ===================================================== */

      const giftName =
        order.name ||
        order.giftName ||
        "هدية";

      const giftId =
        order.giftId ||
        "";

      const points =
        Number(order.points || 0);

      const count =
        Number(order.count || 1);

      const totalPoints =
        points * count;

      const image =
        order.image ||
        "";


      /* =====================================================
         المرحلة
      ===================================================== */

      const stage =
        user.stage ||
        "";


      /* =====================================================
         نص الإشعار
      ===================================================== */

      const title =
        "🔔 طلب هدية جديد";

      const body =
        `المخدوم ${servantName} طلب هدية (${giftName}) 🎁`;


      console.log("👤 المخدوم:", servantName);
      console.log("🎁 الهدية:", giftName);
      console.log("🏫 المرحلة:", stage);


      /* =====================================================
         إنشاء إشعار داخل Firestore
         myNewCollection
      ===================================================== */

      const notificationRef = await db
        .collection("myNewCollection")
        .add({

          /* النص */

          title: title,

          body: body,


          /* نوع الإشعار */

          type: "gift_request",


          /* المستهدفون */

          targetType: "servants",

          targetStage: stage,


          /* بيانات الطلب */

          requestUserId: userId,

          orderId: orderId,

          servantName: servantName,

          giftName: giftName,

          giftId: giftId,

          image: image,

          points: points,

          count: count,

          totalPoints: totalPoints,


          /* حالة الإشعار */

          read: false,


          /* الوقت */

          createdAt:
            FieldValue.serverTimestamp()

        });


      console.log(
        "✅ تم إنشاء إشعار Firestore:",
        notificationRef.id
      );


      /* =====================================================
         جلب جميع الخدام من admins
      ===================================================== */

      const adminsSnapshot =
        await db
          .collection("admins")
          .get();


      if (adminsSnapshot.empty) {

        console.log(
          "⚠️ لا يوجد خدام/مسؤولين في admins"
        );

        return;
      }


      /* =====================================================
         جمع FCM Tokens
      ===================================================== */

      const tokens = [];


      for (
        const adminDoc of adminsSnapshot.docs
      ) {

        const adminId =
          adminDoc.id;


        try {

          const tokenSnap =
            await db
              .collection("notificationTokens")
              .doc(adminId)
              .get();


          if (!tokenSnap.exists) {

            console.log(
              `⚠️ لا يوجد Token للخادم: ${adminId}`
            );

            continue;
          }


          const tokenData =
            tokenSnap.data();


          if (
            tokenData &&
            tokenData.token
          ) {

            tokens.push(
              tokenData.token
            );

            console.log(
              `📱 تم العثور على Token: ${adminId}`
            );
          }

        } catch (tokenError) {

          console.error(
            `❌ خطأ في Token للخادم ${adminId}:`,
            tokenError
          );

        }

      }


      /* =====================================================
         لا يوجد Tokens
      ===================================================== */

      if (!tokens.length) {

        console.log(
          "⚠️ لا توجد FCM Tokens لإرسال Push Notification"
        );

        return;
      }


      console.log(
        `📢 سيتم إرسال الإشعار إلى ${tokens.length} جهاز`
      );


      /* =====================================================
         بيانات Push Notification
      ===================================================== */

      const message = {

        tokens: tokens,


        /* -------------------------------------------------
           الإشعار الظاهر
        ------------------------------------------------- */

        notification: {

          title: title,

          body: body

        },


        /* -------------------------------------------------
           بيانات إضافية
        ------------------------------------------------- */

        data: {

          type: "gift_request",

          notificationId:
            notificationRef.id,

          userId:
            String(userId),

          orderId:
            String(orderId),

          giftId:
            String(giftId),

          giftName:
            String(giftName),

          servantName:
            String(servantName),

          stage:
            String(stage),

          points:
            String(points),

          count:
            String(count),

          totalPoints:
            String(totalPoints)

        },


        /* -------------------------------------------------
           Android
        ------------------------------------------------- */

        android: {

          priority: "high",

          notification: {

            title: title,

            body: body,

            sound: "default",

            channelId:
              "gift_requests",

            defaultSound: true,

            defaultVibrateTimings: true,

            notificationCount: 1

          }

        },


        /* -------------------------------------------------
           Apple
        ------------------------------------------------- */

        apns: {

          payload: {

            aps: {

              alert: {

                title: title,

                body: body

              },

              sound: "default",

              badge: 1

            }

          }

        },


        /* -------------------------------------------------
           Web
        ------------------------------------------------- */

        webpush: {

          headers: {

            Urgency: "high"

          },

          notification: {

            title: title,

            body: body,

            icon:
              "/icon-192.png",

            badge:
              "/icon-192.png",

            requireInteraction: true,

            tag:
              `gift-request-${orderId}`,

            dir: "rtl",

            lang: "ar",

            vibrate: [
              200,
              100,
              200,
              100,
              300
            ]

          },


          fcmOptions: {

            link:
              "/servant-basket.html"

          }

        }

      };


      /* =====================================================
         إرسال الإشعار
      ===================================================== */

      const response =
        await messaging.sendEachForMulticast(
          message
        );


      console.log(
        `✅ تم إرسال ${response.successCount} إشعار`
      );

      console.log(
        `❌ فشل إرسال ${response.failureCount} إشعار`
      );


      /* =====================================================
         تنظيف الـ Tokens التي لم تعد صالحة
      ===================================================== */

      const invalidTokens = [];


      response.responses.forEach(
        (result, index) => {

          if (
            !result.success
          ) {

            const errorCode =
              result.error?.code ||
              "";


            console.error(
              `❌ فشل Token رقم ${index}:`,
              errorCode
            );


            if (

              errorCode ===
                "messaging/registration-token-not-registered"

              ||

              errorCode ===
                "messaging/invalid-registration-token"

            ) {

              invalidTokens.push(
                tokens[index]
              );

            }

          }

        }
      );


      if (invalidTokens.length) {

        console.log(
          `🧹 Tokens غير صالحة: ${invalidTokens.length}`
        );

        /*
          لا نحذف هنا مباشرة من notificationTokens
          لأن الـ document قد يحتوي بيانات أخرى.
        */
      }


      console.log(
        "🎉 انتهى إرسال إشعار طلب الهدية"
      );


    } catch (error) {

      console.error(
        "🔥 خطأ كبير في notifyServantsWhenGiftRequested:",
        error
      );

      throw error;
    }

  }
);
