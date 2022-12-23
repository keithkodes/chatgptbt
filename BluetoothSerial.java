package org.apache.cordova.bluetoothserial;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.util.Log;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.PermissionHelper;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

public class BluetoothSerial extends CordovaPlugin {

    // Constants
    private static final String TAG = "BluetoothSerial";
    private static final String BLUETOOTH_ADMIN_PERM = Manifest.permission.BLUETOOTH_ADMIN;
    private static final String BLUETOOTH_PERM = Manifest.permission.BLUETOOTH;
    private static final String ACCESS_COARSE_LOCATION_PERM = Manifest.permission.ACCESS_COARSE_LOCATION;
    private static final String ACCESS_FINE_LOCATION_PERM = Manifest.permission.ACCESS_FINE_LOCATION;
    private static final int REQUEST_BLUETOOTH_ADMIN_PERM = 0;
    private static final int REQUEST_BLUETOOTH_PERM = 1;
    private static final int REQUEST_COARSE_LOCATION_PERM = 2;
    private static final int REQUEST_FINE_LOCATION_PERM = 3;

    // Properties
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket socket;
    private BroadcastReceiver receiver;
    private CallbackContext connectCallback;
    private boolean secure;
    private UUID uuid;
    private String address;
    private String name;
    private InputStream inStream;
    private OutputStream outStream;

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);

        // Check if we have the necessary permissions
        if (!hasBluetoothAdminPermission()) {
            requestBluetoothAdminPermission();
        }
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission();
        }
        if (!hasCoarseLocationPermission() && !hasFineLocationPermission()) {
            requestCoarseLocationPermission();
        }

        // Initialize the Bluetooth adapter
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        boolean validAction = true;

        if (action.equals("list")) {
            listBondedDevices(callbackContext);
        } else if (action.equals("connect")) {
            connect(args, callbackContext);
        } else if (action.equals("disconnect")) {
            disconnect(callbackContext);
        } else if (action.equals("write")) {
            write(args, callbackContext);
        } else if (action.equals("available")) {
            available(callbackContext);
        } else if (action.equals("read")) {
            read(callbackContext);
        } else if (action.equals("readUntil")) {
            readUntil(args, callbackContext);
        } else if (action.equals("subscribe")) {
            subscribe(args, callbackContext);
        } else if (action.equals("unsubscribe")) {
            unsubscribe(callbackContext);
        } else if (action.equals("isEnabled")) {
            isEnabled(callbackContext);
        } else if (action.equals("isConnected")) {
            isConnected(callbackContext);
        } else {
            validAction = false;
        }

        return validAction;
    }

    private void listBondedDevices(CallbackContext callbackContext) {
        Set<BluetoothDevice> devices = bluetoothAdapter.getBondedDevices();
        JSONArray json = new JSONArray();

        for (BluetoothDevice device : devices) {
            json.put(device.getAddress());
        }

        PluginResult result = new PluginResult(PluginResult.Status.OK, json);
        callbackContext.sendPluginResult(result);
    }

    private void connect(JSONArray args, CallbackContext callbackContext) throws JSONException {
        String macAddress = args.getString(0);
        boolean secure = args.getBoolean(1);
        connectCallback = callbackContext;
        address = macAddress;
        this.secure = secure;
        uuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

        if (!bluetoothAdapter.isEnabled()) {
            PluginResult result = new PluginResult(PluginResult.Status.ERROR, "Bluetooth is disabled.");
            connectCallback.sendPluginResult(result);
            return;
        }

        // Check if we have the necessary permissions
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission();
            return;
        }
        if (!hasCoarseLocationPermission() && !hasFineLocationPermission()) {
            requestCoarseLocationPermission();
            return;
        }

        // Start the discovery process
        bluetoothAdapter.startDiscovery();

        // Register the broadcast receiver
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        cordova.getActivity().registerReceiver(receiver, filter);
    }

    private void disconnect(CallbackContext callbackContext) {
        if (socket == null) {
            callbackContext.error("Not connected.");
            return;
        }

        try {
            socket.close();
            callbackContext.success();
        } catch (IOException e) {
            Log.e(TAG, "Error closing Bluetooth socket: " + e.getMessage(), e);
            callbackContext.error("Error closing Bluetooth socket: " + e.getMessage());
        }
    }

    private void write(JSONArray args, CallbackContext callbackContext) throws JSONException {
        if (outStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        String data = args.getString(0);
        try {
            outStream.write(data.getBytes());
            callbackContext.success();
        } catch (IOException e) {
            Log.e(TAG, "Error writing to Bluetooth output stream: " + e.getMessage(), e);
            callbackContext.error("Error writing to Bluetooth output stream: " + e.getMessage());
        }
    }

    private void available(CallbackContext callbackContext) {
        if (inStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        try {
            int available = inStream.available();
            callbackContext.success(available);
        } catch (IOException e) {
            Log.e(TAG, "Error getting data from Bluetooth input stream: " + e.getMessage(), e);
            callbackContext.error("Error getting data from Bluetooth input stream: " + e.getMessage());
        }
    }

    private void read(CallbackContext callbackContext) {
        if (inStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        try {
            byte[] buffer = new byte[1024];
            int bytesRead = inStream.read(buffer);
            String data = new String(buffer, 0, bytesRead);
            callbackContext.success(data);
        } catch (IOException e) {
            Log.e(TAG, "Error reading from Bluetooth input stream: " + e.getMessage(), e);
            callbackContext.error("Error reading from Bluetooth input stream: " + e.getMessage());
        }
    }

    private void readUntil(JSONArray args, CallbackContext callbackContext) throws JSONException {
        if (inStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        String delimiter = args.getString(0);
        try {
            StringBuilder data = new StringBuilder();
            int character;
            while ((character = inStream.read()) != -1) {
                char c = (char) character;
                data.append(c);
                if (c == delimiter.charAt(delimiter.length() - 1)) {
                    if (data.toString().endsWith(delimiter)) {
                        callbackContext.success(data.toString());
                        return;
                    }
                }
            }
            callbackContext.error("No data received.");
        } catch (IOException e) {
            Log.e(TAG, "Error reading from Bluetooth input stream: " + e.getMessage(), e);
            callbackContext.error("Error reading from Bluetooth input stream: " + e.getMessage());
        }
    }

    private void subscribe(JSONArray args, CallbackContext callbackContext) throws JSONException {
         if (inStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        try {
            inStream.skip(inStream.available());
            int character;
            while ((character = inStream.read()) != -1) {
                char c = (char) character;
                String data = String.valueOf(c);
                PluginResult result = new PluginResult(PluginResult.Status.OK, data);
                result.setKeepCallback(true);
                callbackContext.sendPluginResult(result);
                if (c == delimiter.charAt(delimiter.length() - 1)) {
                    if (data.endsWith(delimiter)) {
                        return;
                    }
                }
            }
            callbackContext.error("No data received.");
        } catch (IOException e) {
            Log.e(TAG, "Error reading from Bluetooth input stream: " + e.getMessage(), e);
            callbackContext.error("Error reading from Bluetooth input stream: " + e.getMessage());
        }
    }

    private void unsubscribe(CallbackContext callbackContext) {
        if (inStream == null) {
            callbackContext.error("Not connected.");
            return;
        }

        try {
            inStream.skip(inStream.available());
            callbackContext.success();
        } catch (IOException e) {
            Log.e(TAG, "Error resetting Bluetooth input stream: " + e.getMessage(), e);
            callbackContext.error("Error resetting Bluetooth input stream: " + e.getMessage());
        }
    }

    private void isEnabled(CallbackContext callbackContext) {
        boolean enabled = bluetoothAdapter.isEnabled();
        callbackContext.success(enabled ? 1 : 0);
    }

    private void isConnected(CallbackContext callbackContext) {
        boolean connected = socket != null && socket.isConnected();
        callbackContext.success(connected ? 1 : 0);
    }

    private boolean hasBluetoothAdminPermission() {
        return PermissionHelper.hasPermission(this, BLUETOOTH_ADMIN_PERM);
    }

    private void requestBluetoothAdminPermission() {
        PermissionHelper.requestPermission(this, REQUEST_BLUETOOTH_ADMIN_PERM, BLUETOOTH_ADMIN_PERM);
    }

    private boolean hasBluetoothPermission() {
        return PermissionHelper.hasPermission(this, BLUETOOTH_PERM);
    }

    private void requestBluetoothPermission() {
        PermissionHelper.requestPermission(this, REQUEST_BLUETOOTH_PERM, BLUETOOTH_PERM);
    }

    private boolean hasCoarseLocationPermission() {
        return PermissionHelper.hasPermission(this, ACCESS_COARSE_LOCATION_PERM);
    }

    private boolean hasFineLocationPermission() {
        return PermissionHelper.hasPermission(this, ACCESS_FINE_LOCATION_PERM);
    }

    private void requestCoarseLocationPermission() {
        PermissionHelper.requestPermission(this, REQUEST_ACCESS_COARSE_LOCATION_PERM, ACCESS_COARSE_LOCATION_PERM);
    }

    private void requestFineLocationPermission() {
        PermissionHelper.requestPermission(this, REQUEST_ACCESS_FINE_LOCATION_PERM, ACCESS_FINE_LOCATION_PERM);
    }

    public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) throws JSONException {
        for (int r : grantResults) {
            if (r == PackageManager.PERMISSION_DENIED) {
                connectCallback.error("Permission denied");
                return;
            }
        }
        switch (requestCode) {
            case REQUEST_BLUETOOTH_PERM:
                connect();
                break;
            case REQUEST_BLUETOOTH_ADMIN_PERM:
                if (connectCallback != null) {
                    connect();
                }
                break;
            case REQUEST_ACCESS_COARSE_LOCATION_PERM:
            case REQUEST_ACCESS_FINE_LOCATION_PERM:
                if (discoverCallback != null) {
                    discover();
                }
                break;
        }
    }

    private class AcceptThread extends Thread {
        private final BluetoothServerSocket serverSocket;

        public AcceptThread() {
            BluetoothServerSocket tmp = null;
            try {
                tmp = bluetoothAdapter.listenUsingRfcommWithServiceRecord(NAME_SECURE, uuid);
            } catch (IOException e) {
                Log.e(TAG, "Socket listen() failed", e);
            }
            serverSocket = tmp;
        }

        public void run() {
            setName("AcceptThread");

            BluetoothSocket socket = null;
            while (state != STATE_CONNECTED) {
                try {
                    socket = serverSocket.accept();
                } catch (IOException e) {
                    Log.e(TAG, "Socket accept() failed", e);
                    break;
                }

                if (socket != null) {
                    synchronized (BluetoothSerial.this) {
                        switch (state) {
                            case STATE_LISTEN:
                            case STATE_CONNECTING:
                                connected(socket, socket.getRemoteDevice());
                                break;
                            case STATE_NONE:
                            case STATE_CONNECTED:
                                try {
                                    socket.close();
                                } catch (IOException e) {
                                    Log.e(TAG, "Could not close unwanted socket", e);
                                }
                                break;
                        }
                    }
                }
            }
        }

        public void cancel() {
            try {
                serverSocket.close();
            } catch (IOException e) {
                Log.e(TAG, "Could not close server socket", e);
            }
        }
    }

    private class ConnectThread extends Thread {
        private final BluetoothSocket socket;
        private final BluetoothDevice device;

        public ConnectThread(BluetoothDevice device) {
            this.device = device;
            BluetoothSocket tmp = null;
            try {
                tmp = device.createRfcommSocketToServiceRecord(uuid);
            } catch (IOException e) {
                Log.e(TAG, "Socket create() failed", e);
            }
            socket = tmp;
        }

        public void run() {
            setName("ConnectThread");

            bluetoothAdapter.cancelDiscovery();

            try {
                socket.connect();
            } catch (IOException e) {
                try {
                    socket.close();
                } catch (IOException e2) {
                    Log.e(TAG, "Could not close client socket", e2);
                }
                connectionFailed();
                return;
            }

            synchronized (BluetoothSerial.this) {
                connectThread = null;
            }

            connected(socket, device);
        }

        public void cancel() {
            try {
                socket.close();
            } catch (IOException e) {
                Log.e(TAG, "Could not close client socket", e);
            }
        }
    }

    private class ConnectedThread extends Thread {
        private final BluetoothSocket socket;
        private final InputStream inStream;
        private final OutputStream outStream;

        public ConnectedThread(BluetoothSocket socket) {
            this.socket = socket;
            InputStream tmpIn = null;
            OutputStream tmpOut = null;

            try {
                tmpIn = socket.getInputStream();
                tmpOut = socket.getOutputStream();
            } catch (IOException e) {
                Log.e(TAG, "Error creating streams", e);
            }

            inStream = tmpIn;
            outStream = tmpOut;
        }

        public void run() {
            setName("ConnectedThread");

            while (true) {
                try {
                    byte[] buffer = new byte[1024];
                    int bytes = inStream.read(buffer);
                    String data = new String(buffer, 0, bytes);
                    PluginResult result = new PluginResult(PluginResult.Status.OK, data);
                    result.setKeepCallback(true);
                    subscribeCallback.sendPluginResult(result);
                } catch (IOException e) {
                    Log.e(TAG, "Error reading from Bluetooth input stream: " + e.getMessage(), e);
                    connectionLost();
                    break;
                }
            }
        }

        public void write(byte[] buffer) {
            try {
                outStream.write(buffer);
            } catch (IOException e) {
                Log.e(TAG, "Error writing to Bluetooth output stream: " + e.getMessage(), e);
            }
        }

        public void cancel() {
            try {
                socket.close();
            } catch (IOException e) {
                Log.e(TAG, "Could not close client socket", e);
            }
        }
    }
}
