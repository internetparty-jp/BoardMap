//=============================================================================
// エントリーポイント
//=============================================================================
var currentInfoWindow;
var APP;
$(function() {
    APP = new kendo.mobile.Application(document.body,
        {
        loading: "<br/><h1>読み込み中</h1>"
    });
  initialize(DEFAULT_LAT,DEFAULT_LNG,MINZOOM);

});
//google.maps.event.addDomListener(window, 'load', initialize);//ロード時に初期化実行

//=============================================================================
// 初期化　
//=============================================================================
var map;
var m_map_data_manager;
var geocoder;
var geo_watch_id=0;
var geo_watch_auto_load_between=150;//GPS連動マップモード時にどの程度移動すれば、掲示板情報を再読込するか(メートル)
var geo_maximumAge=10000;//GPSの定期的な取得間隔(ms)　geo_timeoutより大きい値　端末のバッテリー消費に影響
var geo_timeout=10000;//GPSのタイムアウト(ms)


function initialize(plat,plng,zoom) {
  //マップ・データオブジェクトの初期化
  var myOptions = {
    zoom: zoom,
    center: new google.maps.LatLng(plat,plng),
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    //disableDoubleClickZoom:true,//ダブルクリックによるズームと中央揃えを無効
    maxZoom:MAXZOOM,
    minZoom:MINZOOM,
        //Gmapのボタン位置
        mapTypeControl: false,
        mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.BOTTOM_CENTER
        },
        panControl: false,
       /* panControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT
        },*/
        zoomControl: true,
        zoomControlOptions: {
            style: google.maps.ZoomControlStyle.LARGE,
            position: google.maps.ControlPosition.LEFT_BOTTOM
        },
        scaleControl: false,
        /*scaleControlOptions: {
            position: google.maps.ControlPosition.TOP_LEFT
        },*/
        streetViewControl: true,
        streetViewControlOptions: {
            position: google.maps.ControlPosition.TOP_LEFT
        }
  };
  map = new google.maps.Map(document.getElementById('map_canvas'), myOptions);
  geocoder = new google.maps.Geocoder();//ジオコーダー
  $(document).m_map_data_manager({map:map});//データ管理OBJ
  m_map_data_manager=$(document).data('m_map_data_manager');


    //行政区選択リスト生成
    //if(DEBUG_PROXY){
    //    $.getJSON(PROXY_URL,{'url':CAT_URL+'?key='+API_KEY},cb);
    //}else{
    //    $.getJSON(CAT_URL,{'key':API_KEY},cb);
    //}
    $.getJSON(CAT_URL,{}, cb);
    function cb(d){
        if(!d.issue_categories){return;}
        m_map_data_manager.set_issue_categories(d.issue_categories);
        //行政区の移動 リスト版////////
        var opl=$('<ul/>');
        $.each(d.issue_categories,function(i,val){
            opl.append('<li><label><input type="checkbox" name="" value="'+val['id']+'" />'+val['name']+'</label></li>');
        });

        var acbtn=$('<hr/><a href="javascript:void(0);" onclick="()" class="exec btn center">表示</a>');
        acbtn.bind("click",function(eve){
            //選択した行政区のリストを生成し、行政区に該当する掲示板の問い合わせ
            var ids=[];
            $(':checked',opl).each(function(){
                ids.push($(this).val());
            });
            if(ids.length>5){
                alert("選択は5件以内にして下さい");
               return;
            }
            m_map_data_manager.map_data_clear();
            m_map_data_manager.set_category_ids(ids);
            m_map_data_manager.load_data();
        });

        $('#area_list').append(opl);
        $('#area_list').after(acbtn);

        //地域選択のプルダウン生成////////////
        //ステータス
        var st_op=$('<select class="DropDownList_anime_tar"><option value="open">未貼付</option><option value="close">貼付完了</option><option value="*" selected>全て表示</option></select>');
        //行政区
        var ct_op=$('<select class="DropDownList_anime_tar" />');
        if(!d.issue_categories){return;}
        var g=d.issue_categories;
        ct_op.append('<option value="">地域を選択</option>');
        $.each(g,function(i,val){
            ct_op.append('<option value="'+val['id']+'">'+val['name']+'</option>');
        });

        ///変更時イベント
        $.each([st_op,ct_op],function(i,val){
            val.bind("change",function(eve){
                var category_id= ct_op.val();
                var move_area_status=st_op.val();
                search_country_pos(category_id,move_area_status);
            });
        });
        $('#move_area_status').empty().append(st_op);
        $('#move_area_distince').empty().append(ct_op);

        //ドロップタウンUI生成
        if (kendo.ui.DropDownList) {
            var body = $(".km-pane");
            $.each([st_op,ct_op],function(i,val){
                val.kendoDropDownList({
                    popup: { appendTo: body },
                    animation: { open: { effects: body.hasClass("km-android") ? "fadeIn" : body.hasClass("km-ios") || body.hasClass("km-wp") ? "slideIn:up" : "slideIn:down" } }
                });
            });
        }



        //////////
        re_size_window_comp();//画面サイズの再計算（スマホの場合、プルダウンの長さでヘッダー高さが変わる）
        search_geo_pos();//起動時に、GPSで現在位置の地図と、付近のポスターを表示
    }

    //=============================================================================
    // イベントバインド
    //=============================================================================

    //ステータス変更
    $("#move_area_status").change(function(){
        var category_id= $('#move_area_distince option:selected').val();
        var move_area_status=$(this).val();
        search_country_pos(category_id,move_area_status);
    });

    //ウインドウリサイズ完了
    var timer = null;
    $(window).bind("resize",function(){
        if (timer){clearTimeout(timer);};
      timer = setTimeout(re_size_window_comp, 500);
    });

    //地図データ変更完了時処理
    $(document).bind("on_map_data_change_befor", function(){
        show_load_lock();//読み込み中画面の表示
    });
    $(document).bind("on_map_data_change_after", function(){
        hide_load_lock();//読み込み中画面の解除
        hide_float_panel();
    });

    //ポスター件数受信時
    $(document).bind("on_map_data_receive_info", function(eve,request_args,status_info){
        //件数表示とstatusアイコンの切り替え
        var info_data= m_map_data_manager.get_load_record_info();
        now_cnt=info_data.now_cnt;
        //呼び出すstatusによって左のmarkerを変える
        ico={1:"js/marker_r.png",5:"js/marker_b.png",99:"marker_g.png"};
        var html="";
        for(var i in now_cnt){
            html+='<img src="'+ico[i]+'"/><span>'+now_cnt[i]+'</span>';
        };
        html+='<span>/'+info_data.total_count+'件</span>';
        $("#map_data_receive_info").empty();
        $("#map_data_receive_info").html(html);
    });
    //ポスター件数　データ要求中
    $(document).bind("on_map_data_requesting", function(eve,request_args){
        $("#map_data_receive_roading_img").show();
        $("#map_data_receive_roading_mark").hide();
    });
    //ポスター件数　データ要求完了
    $(document).bind("on_map_data_completion", function(eve){
        $("#map_data_receive_roading_img").hide();
        $("#map_data_receive_roading_mark").show();
    });

    //センター移動
    //google.maps.event.addListener(map, 'center_changed', function() {})

    //クリック
    google.maps.event.addListener(map, 'click', function() {
        //吹き出しを閉じる
        if(currentInfoWindow){
            currentInfoWindow.close();
        }
        hide_float_panel();//フロートパネル閉じる
    })

  //ズーム変更
  google.maps.event.addListener(map, 'zoom_changed', function(){
    //  console.log(map.getZoom());
  });
  //ドラッグ移動終了　
  google.maps.event.addListener(map, 'dragend',function(){
    //ドラッグ移動終了＞画面停止イベント ドラッグ終了後の「idle」にバインド
    google.maps.event.addListenerOnce(map, 'idle', function(){
      //map_dragend();
    });
  });
  //APP初期化完了時イベント
  google.maps.event.addListener(map, 'projection_changed', function(){
    google.maps.event.addListenerOnce(map, 'tilesloaded', function(){
            //
    });
  });

  ////コンテンツ初期化//////////////////////////////////////////
  //ウインドウ内地図リサイズ
re_size_window_comp();

}

//=============================================================================
// イベント処理
//=============================================================================
/**
 * ウインドウリサイズ完了
 */

function re_size_window_comp(){
  //パネル配置計算
/*
  var rp=$("#right_wrap").position();
  var wh=window.innerHeight;
  var ww=window.innerWidth;
  var mp=$("#content-map_wrap").position();
    var mobile_address_bar_height=is_phone()?window.outerHeight-window.innerHeight:0;

*/


  //var mp=$("#map_canvas").position();
    //var rl=ww-($("#right_wrap").width());
  //var rl=ww-($("#right_wrap").width()+20);//20はスクロールバー分
  //$("#right_wrap").css({left:rl});
//  $("#map_canvas").css({width:ww,height:wh-mp.top-mobile_address_bar_height});
   $("#map_canvas").css({width:$('#content-map_wrap').width(),height:$('#content-map_wrap').height()});

    google.maps.event.trigger(map, 'resize');
 /* google.maps.event.trigger(map, 'resize');



    //floatパネル
    var margin_side=50;
    var margin_bottom=70;
    var margin_top=100;
  $("#float_panel").css({top:margin_top,left:margin_side/2,width:ww-margin_side,height:wh-mp.top-margin_bottom});*/
}





//=============================================================================
// ボタン操作用
//=============================================================================

/*
 * エリアの移動（住所）
 */
function move_area_address(){
  var addre=$("#move_area_address").val();
   if(!geocoder){alert("geocoderエラー");return;}
    geocoder.geocode({ 'address': addre}, function(res, st)
    {
        if (st == google.maps.GeocoderStatus.OK) {
      var location = res[0].geometry.location;
            map.panTo(location);
            search_vicinity_poster(location.lat(),location.lng(),'*');
    }else if(st ==google.maps.GeocoderStatus.INVALID_REQUEST||st ==google.maps.GeocoderStatus.ZERO_RESULTS){
      alert("入力した住所では場所が特定出来ませんでした。\n入力した住所に間違いが無いか確認して下さい。\nまた市区町村は必ず入れて下さい。");
    }else{
      alert("サーバーに接続出来ません。時間をあけてから検索してみて下さい："+st);
    }
  });

}
/**
 * 行政区と掲示板のステータスを指定して表示
 */
function search_country_pos(category_id,status){
    if(!category_id){return;}
      m_map_data_manager.map_data_clear();
      m_map_data_manager.set_category_ids([category_id]);
    m_map_data_manager.set_status(status);
      m_map_data_manager.load_data();
    }
/**
 * GPSで現在位置の地図を表示し、その付近のステータスが「完了と未完了」のポスターを表示
 */
function search_geo_pos(){
    navigator.geolocation.getCurrentPosition(function(pos) {
        map.panTo(new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude));
        m_map_data_manager.set_nowposition_marker(pos.coords)//現在位置にマーク描画
        search_vicinity_poster(pos.coords.latitude,pos.coords.longitude,'*');//ポスター検索
    }, function(e) {
        alert(get_geolocation_err_msg(e.code));//+ e.message
        stop_geo_pos_watch();
    },
        {enableHighAccuracy:true,timeout:geo_timeout}
    );
}
/**
 * GPS連動マップモード
 * GPS定期的に監視し、現在位置を描画
 *todo::特定のタイミングで、その付近のステータスが「完了と未完了」のポスターを表示
 */
function search_geo_pos_watch(){
    var old_latlng=m_map_data_manager.get_nowposition_marker();
    if (navigator.geolocation) {
        //トグル処理
        if(geo_watch_id){
            stop_geo_pos_watch();
            return;
        }else{
            //初回のみ処理（初期化処理）
            search_geo_pos();
            //$("#search_geo_pos_watch-btn").addClass("km-state-active-");
            $("#search_geo_pos_watch-btn").css({'background-color':'#C7E7FD'});//無理矢理

        }

        geo_watch_id= navigator.geolocation.watchPosition(function(pos) {
                var now_latlng=new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude);
                m_map_data_manager.set_nowposition_marker(pos.coords);//現在位置にマーク描画
                //----------------------------------------------------------------------------
                //  geo_watch_auto_load_betweenで設定した距離以上を移動したら、掲示板を再検索する
                //  computeDistanceBetween(from,to) 2点間の距離算出 使用にはAPIの読み込み時に引数「libraries=geometry」追加する
                //----------------------------------------------------------------------------
               //console.log("distans "+google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng));
                if(google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng)>=geo_watch_auto_load_between){
                    map.panTo(now_latlng);
                    search_vicinity_poster(now_latlng.lat(),now_latlng.lng(),'*');//ポスター検索
                    old_latlng=now_latlng;
                }
            },
            function(e) {
                alert(get_geolocation_err_msg(e.code));
                stop_geo_pos_watch();
            },
            {enableHighAccuracy:true,timeout:geo_timeout,maximumAge:geo_maximumAge}
        );
    }else{
        window.alert('ご利用の端末では位置情報に対応していません。');
    }
}

/**
 * GPS監視の停止
 */
function stop_geo_pos_watch(){
    if(geo_watch_id){
        navigator.geolocation.clearWatch(geo_watch_id);
        geo_watch_id=0;
        $("#search_geo_pos_watch-btn").css({'background-color':''});//$("#search_geo_pos_watch-btn").removeClass("km-state-active");
        return;
    }
}
/**
 *指定した座標の付近の掲示板の検索
 * @param lat
 * @param lng
 * @param status 省略時は以前に設定した値を継承
 */
function search_vicinity_poster(lat,lng,status){
    hide_load_lock();
    m_map_data_manager.map_data_clear();
    if(status){
        m_map_data_manager.set_status(status);
    }
    m_map_data_manager.set_location([lat,lng]);
    m_map_data_manager.load_nearby_data();
}
/**
 * フロートパネルの表示・非表示
 */
function hide_float_panel(){
    $("#float_panel").hide();

}
/**
 * パネルの表示
 * @param type
 */
function show_info(){
   $("#info-modal").data("kendoMobileModalView").open();
}
function show_adv(){
    $("#adv-modal").data("kendoMobileModalView").open();
}

/**
 * ブックマークの初期化
 */
function init_book_mark(){
    //ブックマークの読み込み
    var list=m_map_data_manager.get_bookmark();
    var str="";
    for(var i=0;i<list.length;i++){
        str+="[id:"+list[i].id+"]\n[date:"+list[i].add_time+"]\n"+list[i].description+"\n"+list[i].subject+"\n----------------\n";
    }
    $("#bookmark_list_txte").val(str);
}
/**
 * ブックマークの全消去
 */
function clear_book_mark(){
    if(window.confirm('全て消去しますか？')){
            m_map_data_manager.clear_bookmark();
        $("#bookmark_list_txte").val("");
    }
}
/**
 * 読み込み中画面の表示・非表示
 */
function show_load_lock(){
    APP.pane.loader.show(); //show loading animation
}
function hide_load_lock(){
    APP.pane.loader.hide();
}

//ブックマーク処理
function book_mark(tar,id){
    var res=m_map_data_manager.tlg_bookmark(id);
}

/**
 * 現在の地図の中心位置から近くの掲示板を取得
 * ステータスが「完了と未完了」のポスターを表示
 */
function load_now_mappos_data(){
  var latlng=  map.getCenter();
    search_vicinity_poster(latlng.lat(),latlng.lng(),'*');
}

/*
* スマホの判定
* */
function is_phone(){
    var device = navigator.userAgent;
   // return ((device.indexOf('iPhone') > 0 && device.indexOf('iPad') == -1) || device.indexOf('iPod') > 0 || device.indexOf('Android') > 0);
    return ((device.indexOf('iPhone') >0)|| (device.indexOf('iPad')>0)|| (device.indexOf('iPod') >0) || (device.indexOf('Android') >0));
}

/**
 * GPSのエラー取得
 */
function get_geolocation_err_msg(int){
    var ms= ['0','GPSの取得を許可されていません','GPSの取得に失敗しました','GPSを取得中にタイムアウトしました'];
    return (ms[int]?ms[int]:'GPSの取得に失敗しました');
}
